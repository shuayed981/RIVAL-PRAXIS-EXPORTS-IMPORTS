import { sendEmail, merchantEmail } from "./email-service.js";

const now = () => new Date().toISOString();
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const cents = value => Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const json = value => JSON.stringify(value ?? null);
const ref = prefix => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
const countryCode = value => ({ portugal: "pt", spain: "es", france: "fr", germany: "de", italy: "it", netherlands: "nl", belgium: "be", ireland: "ie", "united kingdom": "gb" }[clean(value, 60).toLowerCase()] || "pt");
const html = value => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value)); const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function event(env, type, id, name, data = {}) {
  await env.INVOICES_DB.prepare("INSERT INTO commerce_events(entity_type,entity_id,event,event_json,created_at) VALUES(?1,?2,?3,?4,?5)").bind(type, id, name, json(data), now()).run();
}

function customer(input) {
  return { company: clean(input.company, 120), contactName: clean(input.contactName, 120), email: clean(input.email, 150).toLowerCase(), phone: clean(input.phone, 30), taxNumber: clean(input.taxNumber, 40), country: clean(input.country, 60), address: clean(input.address, 200), city: clean(input.city, 80), postcode: clean(input.postcode, 20) };
}

function items(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).map(line => ({ sku: clean(line.sku || line.reference, 50), name: clean(line.name || line.category, 150), size: clean(line.size, 40), quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)), unitPrice: cents(line.unitPrice), lineTotal: cents(line.lineTotal), tax: cents(line.tax), taxRate: Number(line.taxRate) || 0 })).filter(line => line.sku);
}

export async function createQuoteRequest(env, input) {
  if (!env.INVOICES_DB) throw new Error("Commerce database is not configured");
  const buyer = customer(input.customer || {}); const lines = items(input.items);
  if (!buyer.company || !buyer.email.includes("@") || !buyer.address || !lines.length) throw new Error("Complete company details and at least one product are required");
  const reference = ref("RP-RQ"); const id = crypto.randomUUID(); const created = now();
  const estimatedSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  await env.INVOICES_DB.prepare(`INSERT INTO quote_requests(id,request_reference,customer_email,customer_json,items_json,estimated_subtotal,currency,notes,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,'EUR',?7,'requested',?8,?8)`).bind(id, reference, buyer.email, json(buyer), json(lines), estimatedSubtotal, clean(input.notes, 1000), created).run();
  await event(env, "quote_request", id, "requested", { reference });
  await sendEmail(env, { key: `request-customer-${id}`, to: buyer.email, subject: `Quote request received - ${reference}`, heading: "We received your request", body: `<p>Thank you, ${html(buyer.company)}. Your request <b>${reference}</b> is now awaiting commercial review.</p>` });
  await sendEmail(env, { key: `request-merchant-${id}`, to: merchantEmail(env), subject: `New wholesale quote request - ${reference}`, heading: "New wholesale request", body: `<p><b>${html(buyer.company)}</b> submitted request <b>${reference}</b> with ${lines.length} product line(s).</p>` });
  return { requestReference: reference, status: "requested" };
}

export async function publicQuoteByToken(env, token) {
  const row = await env.INVOICES_DB.prepare("SELECT * FROM commerce_quotes WHERE acceptance_token_hash=?1").bind(await sha256(token)).first();
  if (!row) return null;
  return { quoteReference: row.quote_reference, customer: JSON.parse(row.customer_json), items: JSON.parse(row.items_json), subtotal: row.subtotal, tax: row.tax, shipping: row.shipping, total: row.total, currency: row.currency, status: row.status, expiresAt: row.expires_at };
}

export async function acceptQuote(env, token) {
  const hash = await sha256(token); const row = await env.INVOICES_DB.prepare("SELECT * FROM commerce_quotes WHERE acceptance_token_hash=?1").bind(hash).first();
  if (!row) throw new Error("Quotation was not found");
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) throw new Error("Quotation has expired");
  if (!["sent", "accepted"].includes(row.status)) throw new Error("Quotation cannot be accepted");
  if (row.status === "sent") {
    const at = now(); await env.INVOICES_DB.prepare("UPDATE commerce_quotes SET status='accepted',accepted_at=?1,updated_at=?1 WHERE id=?2").bind(at, row.id).run();
    const orderId = crypto.randomUUID(); const orderReference = ref("RP-ORD");
    await env.INVOICES_DB.prepare(`INSERT OR IGNORE INTO orders(id,order_reference,quote_id,quote_reference,customer_email,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'awaiting_payment',?6,?6)`).bind(orderId, orderReference, row.id, row.quote_reference, row.customer_email, at).run();
    const buyer = JSON.parse(row.customer_json); const names = clean(buyer.contactName, 120).split(/\s+/);
    await env.QUOTES.put(`quote:${row.quote_reference}`, json({ ...buyer, firstName: names.shift() || "Buyer", lastName: names.join(" ") || "Contact", email: row.customer_email, phone: buyer.phone, items: JSON.parse(row.items_json).map(line => ({ name: line.name, sku: line.sku, amount: line.lineTotal, tax: line.tax, taxRate: line.taxRate, quantity: line.quantity })), subtotal: row.subtotal, tax: row.tax, shipping: row.shipping, total: row.total, currency: row.currency, status: "approved", paymentStatus: "unpaid", expiresAt: row.expires_at, billing: { street1: buyer.address, city: buyer.city, zipCode: buyer.postcode, country: countryCode(buyer.country) }, tin: buyer.taxNumber }));
    await event(env, "quote", row.id, "accepted", { orderReference });
    await sendEmail(env, { key: `quote-accepted-${row.id}`, to: [row.customer_email, merchantEmail(env)], subject: `Quotation accepted - ${row.quote_reference}`, heading: "Quotation accepted", body: `<p>Quotation <b>${row.quote_reference}</b> has been accepted and is ready for secure payment.</p>`, actionUrl: `${env.SITE_ORIGIN || "https://rivalpraxis.com"}/pay.html`, actionLabel: "Pay approved quote" });
  }
  return { status: "accepted", quoteReference: row.quote_reference };
}

export async function adminList(env) {
  const requests = await env.INVOICES_DB.prepare("SELECT request_reference,customer_email,estimated_subtotal,currency,status,created_at FROM quote_requests ORDER BY created_at DESC LIMIT 100").all();
  const orders = await env.INVOICES_DB.prepare("SELECT order_reference,quote_reference,customer_email,status,transaction_id,tracking_reference,updated_at FROM orders ORDER BY created_at DESC LIMIT 100").all();
  return { requests: requests.results || [], orders: orders.results || [] };
}

export async function adminCreateQuote(env, input) {
  const request = await env.INVOICES_DB.prepare("SELECT * FROM quote_requests WHERE request_reference=?1").bind(clean(input.requestReference, 50).toUpperCase()).first();
  if (!request) throw new Error("Quote request was not found");
  const subtotal = cents(input.subtotal), tax = cents(input.tax), shipping = cents(input.shipping), total = cents(input.total);
  if (total !== subtotal + tax + shipping || total < 100) throw new Error("Quote totals are invalid");
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""); const id = crypto.randomUUID(); const reference = ref("RP-Q"); const at = now();
  const quoteItems = items(input.items?.length ? input.items : JSON.parse(request.items_json));
  await env.INVOICES_DB.prepare(`INSERT INTO commerce_quotes(id,quote_reference,request_id,customer_email,customer_json,items_json,subtotal,tax,shipping,total,currency,status,acceptance_token_hash,expires_at,sent_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'EUR','sent',?11,?12,?13,?13,?13)`).bind(id, reference, request.id, request.customer_email, request.customer_json, json(quoteItems), subtotal, tax, shipping, total, await sha256(token), clean(input.expiresAt, 30), at).run();
  await env.INVOICES_DB.prepare("UPDATE quote_requests SET status='quoted',updated_at=?1 WHERE id=?2").bind(at, request.id).run();
  const link = `${env.SITE_ORIGIN || "https://rivalpraxis.com"}/quote.html?token=${encodeURIComponent(token)}`;
  await event(env, "quote", id, "sent", { reference });
  await sendEmail(env, { key: `quote-sent-${id}`, to: request.customer_email, subject: `Your RIVAL PRAXIS quotation - ${reference}`, heading: "Your quotation is ready", body: `<p>Your confirmed wholesale quotation <b>${reference}</b> is ready to review and accept.</p>`, actionUrl: link, actionLabel: "Review quotation" });
  return { quoteReference: reference, customerLink: link, status: "sent" };
}

export async function adminUpdateOrder(env, input) {
  const allowed = ["processing", "shipped", "delivered", "cancelled", "refunded"]; const status = clean(input.status, 30);
  if (!allowed.includes(status)) throw new Error("Order status is invalid");
  const row = await env.INVOICES_DB.prepare("SELECT * FROM orders WHERE order_reference=?1").bind(clean(input.orderReference, 50).toUpperCase()).first();
  if (!row) throw new Error("Order was not found");
  await env.INVOICES_DB.prepare("UPDATE orders SET status=?1,tracking_reference=?2,updated_at=?3 WHERE id=?4").bind(status, clean(input.trackingReference, 120), now(), row.id).run();
  await event(env, "order", row.id, `status_${status}`, { trackingReference: clean(input.trackingReference, 120) });
  await sendEmail(env, { key: `order-${row.id}-${status}`, to: row.customer_email, subject: `Order ${row.order_reference}: ${status}`, heading: "Order update", body: `<p>Your order <b>${row.order_reference}</b> is now <b>${status}</b>.</p>${input.trackingReference ? `<p>Tracking reference: <b>${html(clean(input.trackingReference, 120))}</b></p>` : ""}` });
  return { orderReference: row.order_reference, status };
}

export async function markOrderPayment(env, quoteReference, transactionId) {
  if (!env.INVOICES_DB) return null; const at = now();
  const row = await env.INVOICES_DB.prepare("SELECT * FROM orders WHERE quote_reference=?1").bind(quoteReference).first();
  if (!row) return null;
  await env.INVOICES_DB.prepare("UPDATE orders SET status='paid',transaction_id=?1,paid_at=COALESCE(paid_at,?2),updated_at=?2 WHERE id=?3").bind(transactionId, at, row.id).run();
  await env.INVOICES_DB.prepare("UPDATE commerce_quotes SET status='paid',updated_at=?1 WHERE quote_reference=?2").bind(at, quoteReference).run();
  await event(env, "order", row.id, "payment_confirmed", { transactionId });
  return row;
}

export async function markOrderPaymentPending(env, quoteReference) {
  if (!env.INVOICES_DB) return;
  await env.INVOICES_DB.prepare("UPDATE orders SET status='payment_pending',updated_at=?1 WHERE quote_reference=?2 AND status='awaiting_payment'").bind(now(), quoteReference).run();
}
