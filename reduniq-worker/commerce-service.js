import { sendEmail, merchantEmail } from "./email-service.js";
import { priceCart } from "./catalog.js";

const now = () => new Date().toISOString();
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const cents = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
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
  return { company: clean(input.company, 120), registrationNumber: clean(input.registrationNumber, 40), contactName: clean(input.contactName, 120), email: clean(input.email, 150).toLowerCase(), phone: clean(input.phone, 30), taxNumber: clean(input.taxNumber, 40), country: clean(input.country, 60), address: clean(input.address, 200), city: clean(input.city, 80), postcode: clean(input.postcode, 20), termsAccepted: input.termsAccepted === true, privacyAccepted: input.privacyAccepted === true };
}

function items(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).map(line => {
    const quantity = Math.min(1000000, Math.max(1, Math.floor(Number(line.quantity) || 1))); const unitPrice = cents(line.unitPrice);
    const calculated = unitPrice * quantity; const lineTotal = Number.isSafeInteger(calculated) ? calculated : 0;
    return { sku: clean(line.sku || line.reference, 50), name: clean(line.name || line.category, 150), size: clean(line.size, 40), quantity, unitPrice, lineTotal, tax: cents(line.tax), taxRate: Math.min(100, Math.max(0, Number(line.taxRate) || 0)) };
  }).filter(line => line.sku);
}

function allocateAmounts(lines, subtotal, tax) {
  const weightTotal = lines.reduce((sum, line) => sum + Math.max(0, line.lineTotal), 0) || lines.length;
  let assignedSubtotal = 0; let assignedTax = 0;
  return lines.map((line, index) => {
    const last = index === lines.length - 1;
    const weight = Math.max(0, line.lineTotal) || 1;
    const lineTotal = last ? subtotal - assignedSubtotal : Math.round(subtotal * weight / weightTotal);
    const lineTax = last ? tax - assignedTax : Math.round(tax * weight / weightTotal);
    assignedSubtotal += lineTotal; assignedTax += lineTax;
    return { ...line, lineTotal, unitPrice: Math.round(lineTotal / line.quantity), tax: lineTax, taxRate: lineTotal > 0 ? Number((lineTax * 100 / lineTotal).toFixed(4)) : 0 };
  });
}

export async function createQuoteRequest(env, input) {
  if (!env.INVOICES_DB) throw new Error("Commerce database is not configured");
  const buyer = customer(input.customer || {}); const lines = items(input.items);
  if (!buyer.company || !buyer.registrationNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email) || !buyer.address || !lines.length) throw new Error("Complete company details and at least one product are required");
  if (!buyer.termsAccepted || !buyer.privacyAccepted) throw new Error("Terms and Privacy acceptance is required");
  const reference = ref("RP-RQ"); const id = crypto.randomUUID(); const created = now();
  const estimatedSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  await env.INVOICES_DB.prepare(`INSERT INTO quote_requests(id,request_reference,customer_email,customer_json,items_json,estimated_subtotal,currency,notes,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,'EUR',?7,'requested',?8,?8)`).bind(id, reference, buyer.email, json(buyer), json(lines), estimatedSubtotal, clean(input.notes, 1000), created).run();
  await event(env, "quote_request", id, "requested", { reference });
  const [customerEmail, merchantAlert] = await Promise.all([
    sendEmail(env, { key: `request-customer-${id}`, to: buyer.email, subject: `Quote request received - ${reference}`, heading: "We received your request", body: `<p>Thank you, ${html(buyer.company)}. Your request <b>${reference}</b> is now awaiting commercial review.</p>` }),
    sendEmail(env, { key: `request-merchant-${id}`, to: merchantEmail(env), subject: `New wholesale quote request - ${reference}`, heading: "New wholesale request", body: `<p><b>${html(buyer.company)}</b> submitted request <b>${reference}</b> with ${lines.length} product line(s).</p>` })
  ]);
  return { requestReference: reference, status: "requested", emailDelivery: { customer: customerEmail.status, merchant: merchantAlert.status } };
}

function checkoutRule(env, country) {
  let rules;
  try { rules = JSON.parse(env.AUTOMATED_CHECKOUT_RULES || "{}"); } catch { throw new Error("Automated checkout pricing rules are invalid"); }
  const code = countryCode(country).toUpperCase();
  const rule = rules[code];
  if (!rule) throw new Error(`Automated checkout is not available for ${clean(country, 60)}`);
  const taxRateBps = Number(rule.taxRateBps);
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new Error("Automated checkout pricing rules are invalid");
  return { code, taxRateBps };
}

export async function createAutomaticOrder(env, input) {
  if (!env.INVOICES_DB) throw new Error("Commerce database is not configured");
  const buyer = customer(input.customer || {}); const lines = priceCart(input.items);
  if (!buyer.company || !buyer.registrationNumber || !buyer.contactName || !buyer.phone || !buyer.city || !buyer.postcode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email) || !buyer.address) throw new Error("Complete company and billing details are required");
  if (!buyer.termsAccepted || !buyer.privacyAccepted) throw new Error("Terms and Privacy acceptance is required");
  const requestKey = clean(input.requestKey, 100);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(requestKey)) throw new Error("A valid checkout request key is required");
  const keyHash = await sha256(requestKey);
  const existing = await env.INVOICES_DB.prepare(`SELECT q.*,o.order_reference,o.status AS payment_status FROM commerce_quotes q JOIN orders o ON o.quote_id=q.id WHERE q.acceptance_token_hash=?1`).bind(keyHash).first();
  if (existing) return { orderReference: existing.order_reference, quoteReference: existing.quote_reference, customerEmail: existing.customer_email };
  const rule = checkoutRule(env, buyer.country);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const tax = Math.round(subtotal * rule.taxRateBps / 10000);
  const shipping = 0; const total = subtotal + tax;
  if (![subtotal, tax, total].every(Number.isSafeInteger) || total < 100) throw new Error("Order total is invalid");
  const pricedLines = lines.map(line => ({ ...line, tax: Math.round(line.lineTotal * rule.taxRateBps / 10000), taxRate: rule.taxRateBps / 100 }));
  const taxDifference = tax - pricedLines.reduce((sum, line) => sum + line.tax, 0);
  pricedLines[pricedLines.length - 1].tax += taxDifference;
  const quoteId = crypto.randomUUID(); const orderId = crypto.randomUUID(); const orderReference = ref("RP-ORD"); const internalReference = ref("RP-AUTO"); const at = now();
  await env.INVOICES_DB.prepare(`INSERT INTO commerce_quotes(id,quote_reference,request_id,customer_email,customer_json,items_json,subtotal,tax,shipping,total,currency,status,acceptance_token_hash,expires_at,sent_at,accepted_at,created_at,updated_at)
    VALUES(?1,?2,NULL,?3,?4,?5,?6,?7,?8,?9,'EUR','accepted',?10,NULL,?11,?11,?11,?11)`).bind(quoteId, internalReference, buyer.email, json(buyer), json(pricedLines), subtotal, tax, shipping, total, keyHash, at).run();
  await env.INVOICES_DB.prepare(`INSERT INTO orders(id,order_reference,quote_id,quote_reference,customer_email,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'awaiting_payment',?6,?6)`).bind(orderId, orderReference, quoteId, internalReference, buyer.email, at).run();
  await event(env, "order", orderId, "checkout_created", { orderReference, subtotal, tax, shipping, total, country: rule.code });
  await Promise.all([
    sendEmail(env, { key: `checkout-customer-${orderId}`, to: buyer.email, subject: `Order created - ${orderReference}`, heading: "Secure payment started", body: `<p>Your order <b>${html(orderReference)}</b> was priced automatically and is ready for secure payment.</p>` }),
    sendEmail(env, { key: `checkout-merchant-${orderId}`, to: merchantEmail(env), subject: `Automated order created - ${orderReference}`, heading: "Automated order", body: `<p><b>${html(buyer.company)}</b> created order <b>${html(orderReference)}</b>. No quotation approval is required.</p>` })
  ]);
  return { orderReference, quoteReference: internalReference, customerEmail: buyer.email };
}

export async function publicQuoteByToken(env, token) {
  const row = await env.INVOICES_DB.prepare("SELECT * FROM commerce_quotes WHERE acceptance_token_hash=?1").bind(await sha256(token)).first();
  if (!row) return null;
  return { quoteReference: row.quote_reference, quoteDate: row.sent_at || row.created_at, customer: JSON.parse(row.customer_json), items: JSON.parse(row.items_json), subtotal: row.subtotal, tax: row.tax, shipping: row.shipping, total: row.total, currency: row.currency, status: row.status, expiresAt: row.expires_at };
}

export async function acceptQuote(env, token, acceptance = {}) {
  if (acceptance.termsAccepted !== true || acceptance.privacyAccepted !== true) throw new Error("Terms and Privacy acceptance is required");
  const hash = await sha256(token); const row = await env.INVOICES_DB.prepare("SELECT * FROM commerce_quotes WHERE acceptance_token_hash=?1").bind(hash).first();
  if (!row) throw new Error("Quotation was not found");
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) throw new Error("Quotation has expired");
  if (!["sent", "accepted"].includes(row.status)) throw new Error("Quotation cannot be accepted");
  if (row.status === "sent") {
    const at = now(); const accepted = await env.INVOICES_DB.prepare("UPDATE commerce_quotes SET status='accepted',accepted_at=?1,updated_at=?1 WHERE id=?2 AND status='sent'").bind(at, row.id).run();
    if (!accepted.meta?.changes) return { status: "accepted", quoteReference: row.quote_reference };
    const orderId = crypto.randomUUID(); const orderReference = ref("RP-ORD");
    await env.INVOICES_DB.prepare(`INSERT OR IGNORE INTO orders(id,order_reference,quote_id,quote_reference,customer_email,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'awaiting_payment',?6,?6)`).bind(orderId, orderReference, row.id, row.quote_reference, row.customer_email, at).run();
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
  if (!["requested", "reviewing"].includes(request.status)) throw new Error("Quote request has already been processed");
  const subtotal = cents(input.subtotal), tax = cents(input.tax), shipping = cents(input.shipping), total = cents(input.total);
  if (total !== subtotal + tax + shipping || total < 100) throw new Error("Quote totals are invalid");
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""); const id = crypto.randomUUID(); const reference = ref("RP-Q"); const at = now();
  const sourceItems = items(input.items?.length ? input.items : JSON.parse(request.items_json));
  if (!sourceItems.length) throw new Error("At least one valid quote item is required");
  const quoteItems = allocateAmounts(sourceItems, subtotal, tax);
  if (quoteItems.reduce((sum, line) => sum + line.lineTotal, 0) !== subtotal || quoteItems.reduce((sum, line) => sum + line.tax, 0) !== tax) throw new Error("Quote line allocation is invalid");
  if (!input.expiresAt || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()) throw new Error("Quote expiry date is invalid");
  await env.INVOICES_DB.prepare(`INSERT INTO commerce_quotes(id,quote_reference,request_id,customer_email,customer_json,items_json,subtotal,tax,shipping,total,currency,status,acceptance_token_hash,expires_at,sent_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'EUR','sent',?11,?12,?13,?13,?13)`).bind(id, reference, request.id, request.customer_email, request.customer_json, json(quoteItems), subtotal, tax, shipping, total, await sha256(token), clean(input.expiresAt, 30), at).run();
  await env.INVOICES_DB.prepare("UPDATE quote_requests SET status='quoted',updated_at=?1 WHERE id=?2").bind(at, request.id).run();
  const link = `${env.SITE_ORIGIN || "https://rivalpraxis.com"}/quote.html?token=${encodeURIComponent(token)}`;
  await event(env, "quote", id, "sent", { reference });
  const delivery = await sendEmail(env, { key: `quote-sent-${id}`, to: request.customer_email, subject: `Your RIVAL PRAXIS quotation - ${reference}`, heading: "Your quotation is ready", body: `<p>Your confirmed wholesale quotation <b>${reference}</b> is ready to review and accept.</p>`, actionUrl: link, actionLabel: "Review quotation" });
  return { quoteReference: reference, customerLink: link, status: "sent", emailDelivery: delivery.status };
}

export async function adminUpdateOrder(env, input) {
  const status = clean(input.status, 30);
  const row = await env.INVOICES_DB.prepare("SELECT * FROM orders WHERE order_reference=?1").bind(clean(input.orderReference, 50).toUpperCase()).first();
  if (!row) throw new Error("Order was not found");
  const transitions = { paid: ["processing"], processing: ["shipped"], shipped: ["delivered"] };
  if (!(transitions[row.status] || []).includes(status)) throw new Error(`Order cannot move from ${row.status} to ${status}`);
  await env.INVOICES_DB.prepare("UPDATE orders SET status=?1,tracking_reference=?2,updated_at=?3 WHERE id=?4").bind(status, clean(input.trackingReference, 120), now(), row.id).run();
  await event(env, "order", row.id, `status_${status}`, { trackingReference: clean(input.trackingReference, 120) });
  await sendEmail(env, { key: `order-${row.id}-${status}`, to: row.customer_email, subject: `Order ${row.order_reference}: ${status}`, heading: "Order update", body: `<p>Your order <b>${row.order_reference}</b> is now <b>${status}</b>.</p>${input.trackingReference ? `<p>Tracking reference: <b>${html(clean(input.trackingReference, 120))}</b></p>` : ""}` });
  return { orderReference: row.order_reference, status };
}
