import { audit, normalize } from "./worker-runtime.js";

const now = () => new Date().toISOString();
const countryCode = value => ({ portugal: "pt", spain: "es", france: "fr", germany: "de", italy: "it", netherlands: "nl", belgium: "be", ireland: "ie", "united kingdom": "gb" }[normalize(value, 60).toLowerCase()] || (/^[a-z]{2}$/i.test(normalize(value, 2)) ? normalize(value, 2).toLowerCase() : "pt"));

export async function loadPayableOrder(env, quoteReference, email) {
  const reference = normalize(quoteReference, 50).toUpperCase();
  const normalizedEmail = normalize(email).toLowerCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{3,49}$/.test(reference) || !normalizedEmail.includes("@")) return null;
  const row = await env.INVOICES_DB.prepare(`SELECT q.*,o.status AS payment_status
    FROM commerce_quotes q JOIN orders o ON o.quote_id=q.id
    WHERE q.quote_reference=?1 AND lower(q.customer_email)=?2 AND q.status IN ('accepted','paid')`).bind(reference, normalizedEmail).first();
  if (!row || ![row.subtotal, row.tax, row.shipping, row.total].every(Number.isSafeInteger)) return null;
  if (row.total !== row.subtotal + row.tax + row.shipping || row.total < 100) return null;
  const buyer = JSON.parse(row.customer_json); const names = normalize(buyer.contactName, 120).split(/\s+/);
  const address = { name: buyer.company, street1: buyer.address, city: buyer.city, zipCode: buyer.postcode, country: countryCode(buyer.country), phone: buyer.phone };
  return {
    ...buyer,
    quoteReference: reference,
    firstName: names.shift() || "Buyer",
    lastName: names.join(" ") || "Contact",
    email: row.customer_email,
    phone: buyer.phone,
    items: JSON.parse(row.items_json).map(line => ({ name: line.name, sku: line.sku, amount: line.lineTotal, tax: line.tax, taxRate: line.taxRate, quantity: line.quantity })),
    subtotal: row.subtotal,
    tax: row.tax,
    shipping: row.shipping,
    total: row.total,
    currency: row.currency,
    expiresAt: row.expires_at,
    billing: address,
    tin: buyer.taxNumber,
    paymentStatus: ["paid", "processing", "shipped", "delivered"].includes(row.payment_status) ? "paid" : "unpaid",
  };
}
export async function markOrderPaymentPending(env, quoteReference) {
  await env.INVOICES_DB.prepare("UPDATE orders SET status='payment_pending',updated_at=?1 WHERE quote_reference=?2 AND status='awaiting_payment'").bind(now(), quoteReference).run();
}

export async function markOrderPaid(env, quoteReference, transactionId) {
  const at = now();
  const row = await env.INVOICES_DB.prepare("SELECT * FROM orders WHERE quote_reference=?1").bind(quoteReference).first();
  if (!row) return null;
  const result = await env.INVOICES_DB.prepare("UPDATE orders SET status='paid',transaction_id=?1,paid_at=COALESCE(paid_at,?2),updated_at=?2 WHERE id=?3 AND status IN ('awaiting_payment','payment_pending','paid')").bind(transactionId, at, row.id).run();
  if (!result.meta?.changes && !["paid", "processing", "shipped", "delivered"].includes(row.status)) return null;
  await env.INVOICES_DB.prepare("UPDATE commerce_quotes SET status='paid',updated_at=?1 WHERE quote_reference=?2").bind(at, quoteReference).run();
  await audit(env, row.id, "payment_confirmed", { transactionId });
  return { ...row, status: "paid", transaction_id: transactionId, paid_at: row.paid_at || at };
}
