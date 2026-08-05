import { createQuoteRequest, publicQuoteByToken, acceptQuote, adminList, adminCreateQuote, adminUpdateOrder, markOrderPayment, markOrderPaymentPending } from "./commerce-service.js";
import { sendEmail, merchantEmail } from "./email-service.js";

const gatewayEndpoint = (env) => {
  const version = env.REDUNIQ_API_VERSION === "6.0" ? "6.0" : "7.0";
  const host = env.REDUNIQ_ENVIRONMENT === "production" ? "pagamentos.reduniq.pt" : "pagamentos.sandbox.reduniq.pt";
  return `https://${host}/api-gateway/v${version}/rest/`;
};
const SESSION_TTL_SECONDS = 86400 * 7;
const RATE_WINDOW_SECONDS = 60 * 15;
const RATE_LIMIT = 12;
const MAX_REQUEST_BYTES = 262144;
const textEncoder = new TextEncoder();

const json = (body, status = 200, origin = "https://rivalpraxis.com") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  }
});

const normalize = (value, max = 150) => String(value || "").trim().slice(0, max);
const escapeHtml = value => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const amountText = (cents, currency = "EUR") => `${(Number(cents || 0) / 100).toFixed(2)} ${normalize(currency, 3).toUpperCase() || "EUR"}`;

function accountingSummary(quote) {
  const lines = (quote.items || []).slice(0, 100).map(item => `<li>${escapeHtml(item.sku || "Item")} — ${escapeHtml(item.name || "Wholesale goods")} — Qty ${Number(item.quantity) || 1} — Net ${escapeHtml(amountText(item.amount, quote.currency))} — VAT ${escapeHtml(amountText(item.tax, quote.currency))}</li>`).join("");
  const billing = quote.billing || {};
  return `<p><b>Customer:</b> ${escapeHtml(quote.company)}<br><b>Contact:</b> ${escapeHtml([quote.firstName, quote.lastName].filter(Boolean).join(" "))}<br><b>Email:</b> ${escapeHtml(quote.email)}<br><b>Tax number:</b> ${escapeHtml(quote.tin)}<br><b>Billing address:</b> ${escapeHtml([billing.street1, billing.street2, billing.zipCode, billing.city, billing.country].filter(Boolean).join(", "))}</p><p><b>Order lines:</b></p><ul>${lines}</ul><p><b>Subtotal:</b> ${escapeHtml(amountText(quote.subtotal, quote.currency))}<br><b>VAT:</b> ${escapeHtml(amountText(quote.tax, quote.currency))}<br><b>Shipping:</b> ${escapeHtml(amountText(quote.shipping, quote.currency))}<br><b>Total paid:</b> ${escapeHtml(amountText(quote.total, quote.currency))}</p>`;
}
const countryCode = value => ({ portugal: "pt", spain: "es", france: "fr", germany: "de", italy: "it", netherlands: "nl", belgium: "be", ireland: "ie", "united kingdom": "gb" }[normalize(value, 60).toLowerCase()] || (/^[a-z]{2}$/i.test(normalize(value, 2)) ? normalize(value, 2).toLowerCase() : "pt"));
const rateKey = (request, action) => {
  const address = normalize(request.headers.get("CF-Connecting-IP") || "unknown", 64);
  return `rate:${action}:${address}`;
};
const orderDate = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function sha256Hex(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value))))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function allowedOrigin(request, env) {
  const expected = env.SITE_ORIGIN || "https://rivalpraxis.com";
  const origin = request.headers.get("Origin");
  return !origin || origin === expected ? expected : null;
}

async function bodyOf(request) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new Error("JSON_REQUIRED");
  if (Number(request.headers.get("Content-Length") || 0) > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("JSON_INVALID");
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error("REQUEST_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("JSON_INVALID"); }
}

async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([left, right].map(async value => new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)))));
  let difference = 0; for (let index = 0; index < leftHash.length; index += 1) difference |= leftHash[index] ^ rightHash[index];
  return difference === 0;
}

async function isAdmin(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || ""); const supplied = String(request.headers.get("Authorization") || "");
  return expected.length >= 32 && await secureEqual(supplied, `Bearer ${expected}`);
}

async function enforceRateLimit(request, env, action) {
  const key = rateKey(request, action);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + RATE_WINDOW_SECONDS;
  const row = await env.INVOICES_DB.prepare(`INSERT INTO api_rate_limits(rate_key,request_count,expires_at)
    VALUES(?1,1,?2)
    ON CONFLICT(rate_key) DO UPDATE SET
      request_count=CASE WHEN expires_at<=?3 THEN 1 ELSE request_count+1 END,
      expires_at=CASE WHEN expires_at<=?3 THEN ?2 ELSE expires_at END
    RETURNING request_count,expires_at`).bind(key, expires, now).first();
  return Number(row?.request_count || RATE_LIMIT + 1) <= RATE_LIMIT;
}

async function audit(env, reference, event, details = {}) {
  await env.INVOICES_DB.prepare(`INSERT INTO commerce_events(entity_type,entity_id,event,event_json,created_at)
    VALUES('quote',?1,?2,?3,?4)`).bind(normalize(reference, 50).toUpperCase(), event, JSON.stringify(details), new Date().toISOString()).run();
}

async function getApprovedQuote(env, quoteReference, email) {
  const reference = normalize(quoteReference, 50).toUpperCase();
  const normalizedEmail = normalize(email).toLowerCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{3,49}$/.test(reference) || !normalizedEmail.includes("@")) return null;
  const row = await env.INVOICES_DB.prepare(`SELECT q.*,o.status AS payment_status
    FROM commerce_quotes q JOIN orders o ON o.quote_id=q.id
    WHERE q.quote_reference=?1 AND lower(q.customer_email)=?2 AND q.status IN ('accepted','paid')`).bind(reference, normalizedEmail).first();
  if (!row || ![row.subtotal, row.tax, row.shipping, row.total].every(Number.isSafeInteger)) return null;
  if (row.total !== row.subtotal + row.tax + row.shipping || row.total < 100) return null;
  const buyer = JSON.parse(row.customer_json);
  const names = normalize(buyer.contactName, 120).split(/\s+/);
  const address = { name: buyer.company, street1: buyer.address, city: buyer.city, zipCode: buyer.postcode, country: countryCode(buyer.country), phone: buyer.phone };
  return { ...buyer, quoteReference: reference, firstName: names.shift() || "Buyer", lastName: names.join(" ") || "Contact",
    email: row.customer_email, phone: buyer.phone, items: JSON.parse(row.items_json).map(line => ({ name: line.name, sku: line.sku, amount: line.lineTotal, tax: line.tax, taxRate: line.taxRate, quantity: line.quantity })),
    subtotal: row.subtotal, tax: row.tax, shipping: row.shipping, total: row.total, currency: row.currency, expiresAt: row.expires_at,
    billing: address, shippingAddress: address, tin: buyer.taxNumber, paymentStatus: row.payment_status === "paid" ? "paid" : "unpaid" };
}

async function gateway(env, payload) {
  const response = await fetch(gatewayEndpoint(env), { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
  if (Number(response.headers.get("Content-Length") || 0) > 1048576) throw new Error("Gateway response is too large");
  const text = await response.text();
  if (text.length > 1048576) throw new Error("Gateway response is too large");
  try { return JSON.parse(text); } catch { throw new Error("Gateway returned invalid JSON"); }
}

function apiCredentials(env) {
  if (!env.REDUNIQ_API_USERNAME || !env.REDUNIQ_API_PASSWORD) throw new Error("REDUNIQ credentials are not configured");
  return { username: env.REDUNIQ_API_USERNAME, password: env.REDUNIQ_API_PASSWORD };
}

function paymentsEnabled(env) {
  return env.PAYMENTS_ENABLED === "true";
}

function commerceEnabled(env) {
  return env.COMMERCE_ENABLED === "true";
}

function assertPaymentConfiguration(env) {
  if (!paymentsEnabled(env)) throw new Error("PAYMENTS_DISABLED");
  if (!/^\d{3}$/.test(String(env.REDUNIQ_PAYMENT_SOLUTION || ""))) throw new Error("PAYMENT_CONFIGURATION_REQUIRED");
  apiCredentials(env);
}

function publicQuote(quote) {
  return { quoteReference: quote.quoteReference, company: quote.company, subtotal: quote.subtotal, tax: quote.tax, shipping: quote.shipping, total: quote.total, currency: quote.currency || "EUR", expiresAt: quote.expiresAt || null };
}

async function lookupQuote(request, env, origin) {
  if (!commerceEnabled(env) && !paymentsEnabled(env)) return json({ message: "Online quotation lookup is not active yet." }, 503, origin);
  if (!(await enforceRateLimit(request, env, "lookup"))) return json({ message: "Too many attempts. Wait 15 minutes before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const quote = await getApprovedQuote(env, input.quoteReference, input.email);
  if (!quote) return json({ message: "The quotation reference or billing email could not be verified." }, 404, origin);
  if (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now()) return json({ message: "This quotation has expired. Request an updated quotation before paying." }, 409, origin);
  if (quote.paymentStatus === "paid") return json({ message: "This quotation is already paid." }, 409, origin);
  return json(publicQuote(quote), 200, origin);
}

async function initPayment(request, env, origin) {
  assertPaymentConfiguration(env);
  if (!(await enforceRateLimit(request, env, "payment"))) return json({ message: "Too many payment attempts. Wait 15 minutes before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const quote = await getApprovedQuote(env, input.quoteReference, input.email);
  if (!quote) return json({ message: "The quotation could not be verified." }, 404, origin);
  if (quote.paymentStatus === "paid") return json({ message: "This quotation is already paid." }, 409, origin);
  const sessionNow = new Date().toISOString();
  await env.INVOICES_DB.prepare("UPDATE payment_sessions SET status='expired',updated_at=?1 WHERE quote_reference=?2 AND status='pending' AND expires_at<=?1").bind(sessionNow, quote.quoteReference).run();
  const existingSession = await env.INVOICES_DB.prepare(`SELECT payment_token,redirect_url FROM payment_sessions
    WHERE quote_reference=?1 AND status='pending' AND expires_at>?2 ORDER BY created_at DESC LIMIT 1`).bind(quote.quoteReference, sessionNow).first();
  if (existingSession?.redirect_url) return json({ token: existingSession.payment_token, redirectUrl: existingSession.redirect_url }, 200, origin);
  if (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now()) return json({ message: "This quotation has expired." }, 409, origin);
  const site = env.SITE_ORIGIN || "https://rivalpraxis.com";
  const apiOrigin = env.API_ORIGIN || "https://payments.rivalpraxis.com";
  const solution = normalize(env.REDUNIQ_PAYMENT_SOLUTION, 3);
  const payload = {
    method: "initPayment",
    api: apiCredentials(env),
    payment: { amount: quote.total, action: 101, solution, deadline: "", description: `RIVAL PRAXIS quotation ${quote.quoteReference}` },
    order: {
      ref: `${quote.quoteReference}-${Date.now()}`.slice(0, 50), amount: quote.subtotal, taxes: quote.tax, date: orderDate(), shipping: quote.shipping > 0 ? "1" : "0",
      // REDUNIQ defines detail amounts as unit values. One aggregate unit guarantees
      // exact reconciliation with the merchant-approved order amount and tax.
      details: [{ name: `Wholesale quotation ${quote.quoteReference}`.slice(0, 50), amount: quote.subtotal, tax: quote.tax, quantity: 1, category: "1" }]
    },
    buyer: {
      firstName: normalize(quote.firstName, 50), lastName: normalize(quote.lastName, 50), email: normalize(quote.email), phone: normalize(quote.phone, 15),
      billing: { street1: normalize(quote.billing?.street1, 100), street2: normalize(quote.billing?.street2, 100), city: normalize(quote.billing?.city, 40), state: normalize(quote.billing?.state, 40), zipCode: normalize(quote.billing?.zipCode, 20), country: normalize(quote.billing?.country || "pt", 2), tin: normalize(quote.tin, 20) }
    },
    mode: "redirect",
    returnUrlOk: `${site}/payment-status.html`,
    returnUrlError: `${site}/payment-status.html?result=error`,
    notificationUrl: `${apiOrigin}/api/payment/notification`,
    privateData: [{ name: "quoteReference", value: quote.quoteReference }], languageCode: "eng"
  };
  if (quote.shipping > 0) {
    const shipping = quote.shippingAddress || quote.billing;
    if (!shipping?.street1 || !shipping?.city || !shipping?.zipCode || !shipping?.country) throw new Error("SHIPPING_ADDRESS_REQUIRED");
    payload.buyer.shipping = { name: normalize(shipping.name || quote.company, 32), street1: normalize(shipping.street1, 100), street2: normalize(shipping.street2, 100), city: normalize(shipping.city, 40), state: normalize(shipping.state, 40), zipCode: normalize(shipping.zipCode, 20), country: normalize(shipping.country || "pt", 2), phone: normalize(shipping.phone || quote.phone, 15), amount: quote.shipping };
  }
  const result = await gateway(env, payload);
  if (result?.result?.code !== "00000000" || !result.token || !result.redirectUrl) return json({ message: "REDUNIQ could not initialize this payment." }, 502, origin);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  try {
    await env.INVOICES_DB.prepare(`INSERT INTO payment_sessions(token_hash,payment_token,quote_reference,total,currency,redirect_url,status,created_at,expires_at,updated_at)
      VALUES(?1,?2,?3,?4,?5,?6,'pending',?7,?8,?7)`).bind(await sha256Hex(result.token), result.token, quote.quoteReference, quote.total, quote.currency || "EUR", result.redirectUrl, createdAt, expiresAt).run();
  } catch (error) {
    const winner = await env.INVOICES_DB.prepare("SELECT payment_token,redirect_url FROM payment_sessions WHERE quote_reference=?1 AND status='pending' AND expires_at>?2 LIMIT 1").bind(quote.quoteReference, createdAt).first();
    if (winner?.redirect_url) return json({ token: winner.payment_token, redirectUrl: winner.redirect_url }, 200, origin);
    throw error;
  }
  await markOrderPaymentPending(env, quote.quoteReference);
  await audit(env, quote.quoteReference, "payment_initialized", { expiresAt });
  return json({ token: result.token, redirectUrl: result.redirectUrl }, 200, origin);
}

async function verifyToken(env, token) {
  const normalizedToken = normalize(token, 80);
  const row = await env.INVOICES_DB.prepare(`SELECT quote_reference,total,currency,redirect_url,status,expires_at
    FROM payment_sessions WHERE token_hash=?1`).bind(await sha256Hex(normalizedToken)).first();
  if (!row || row.expires_at <= new Date().toISOString()) return null;
  const session = { quoteReference: row.quote_reference, total: row.total, currency: row.currency, redirectUrl: row.redirect_url };
  const result = await gateway(env, { method: "getResult", api: apiCredentials(env), token: normalizedToken });
  const gatewayAmount = Number(result?.payment?.amount ?? result?.paymentAmount);
  const resultCode = String(result?.result?.code || "");
  // REDUNIQ specifies transaction.status as the authoritative success field.
  // An exact server-side amount match remains mandatory before fulfilment.
  const transactionId = normalize(result?.transaction?.id, 80);
  const paid = resultCode === "00000000" && Number(result?.transaction?.status) === 4 && Boolean(transactionId) && Number.isSafeInteger(gatewayAmount) && gatewayAmount === session.total;
  if (!paid && Number(result?.transaction?.status) === 3 && row.status === "pending") {
    await env.INVOICES_DB.prepare("UPDATE payment_sessions SET status='failed',updated_at=?1 WHERE token_hash=?2 AND status='pending'")
      .bind(new Date().toISOString(), await sha256Hex(normalizedToken)).run();
  }
  if (paid) {
    const quote = await getApprovedQuote(env, session.quoteReference, (await env.INVOICES_DB.prepare("SELECT customer_email FROM orders WHERE quote_reference=?1").bind(session.quoteReference).first())?.customer_email);
    if (row.status !== "paid") {
      await env.INVOICES_DB.prepare(`UPDATE payment_sessions SET status='paid',transaction_id=?1,updated_at=?2
        WHERE token_hash=?3 AND status='pending'`).bind(transactionId, new Date().toISOString(), await sha256Hex(normalizedToken)).run();
      await audit(env, session.quoteReference, "payment_confirmed", { transactionId, total: session.total, currency: session.currency, resultCode });
    }
    if (quote) {
      const order = await markOrderPayment(env, session.quoteReference, transactionId);
      if (order) {
        await sendEmail(env, { key: `payment-customer-${transactionId}`, to: order.customer_email, subject: `Payment confirmed - ${order.order_reference}`, heading: "Payment confirmed", body: `<p>We securely confirmed payment of <b>${escapeHtml(amountText(session.total, session.currency))}</b> for order <b>${escapeHtml(order.order_reference)}</b>.</p><p>Quotation: <b>${escapeHtml(session.quoteReference)}</b><br>Transaction: <b>${escapeHtml(transactionId)}</b></p><p>Your official invoice will be prepared separately by our accounting team and sent to your billing email.</p>` });
        await sendEmail(env, { key: `payment-merchant-${transactionId}`, to: merchantEmail(env), subject: `Payment received - ${order.order_reference} - manual invoice required`, heading: "Payment received", body: `<p>Order <b>${escapeHtml(order.order_reference)}</b> and quotation <b>${escapeHtml(session.quoteReference)}</b> have been paid.</p><p>Transaction: <b>${escapeHtml(transactionId)}</b></p>${accountingSummary(quote)}<p><b>Action required:</b> forward these details to the accountant for manual invoicing in AT-certified software.</p>` });
        await audit(env, session.quoteReference, "manual_invoice_required", { orderReference: order.order_reference, transactionId });
      }
    }
  }
  return { paid, session, result };
}

async function paymentResult(request, env, origin) {
  if (!(await enforceRateLimit(request, env, "result"))) return json({ message: "Too many verification attempts. Wait before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const verified = await verifyToken(env, input.token);
  if (!verified) return json({ message: "The payment session was not found." }, 404, origin);
  if (!verified.paid) {
    await audit(env, verified.session.quoteReference, "payment_not_confirmed", { transactionStatus: Number(verified.result?.transaction?.status) || null, resultCode: normalize(verified.result?.result?.code, 30) });
    return json({ status: "not_paid", message: "REDUNIQ has not confirmed this payment. Do not submit another payment until support checks the transaction." }, 409, origin);
  }
  return json({ status: "paid", quoteReference: verified.session.quoteReference, transactionId: normalize(verified.result?.transaction?.id, 50), total: verified.session.total, currency: verified.session.currency, invoicing: "manual" }, 200, origin);
}

async function notification(request, env, origin) {
  let token = "";
  const type = request.headers.get("Content-Type") || "";
  if (Number(request.headers.get("Content-Length") || 0) > 65536) return json({ message: "Notification is too large" }, 413, origin);
  if (type.includes("application/json")) token = (await bodyOf(request)).token;
  else if (type.includes("application/x-www-form-urlencoded")) { const text = await request.text(); if (text.length > 65536) return json({ message: "Notification is too large" }, 413, origin); const form = new URLSearchParams(text); token = form.get("TOKEN") || form.get("token"); }
  else { const form = await request.formData(); token = form.get("TOKEN") || form.get("token"); }
  if (!token) return json({ message: "Missing token" }, 400, origin);
  const verified = await verifyToken(env, token);
  return json({ received: true, paid: Boolean(verified?.paid) }, 200, origin);
}

async function quoteRequest(request, env, origin) {
  if (!commerceEnabled(env)) return json({ message: "Online quotation requests are not active yet." }, 503, origin);
  if (!(await enforceRateLimit(request, env, "quote-request"))) return json({ message: "Too many requests. Please wait before trying again." }, 429, origin);
  return json(await createQuoteRequest(env, await bodyOf(request)), 201, origin);
}

async function quoteView(request, env, origin) {
  if (!commerceEnabled(env)) return json({ message: "Online quotations are not active yet." }, 503, origin);
  const result = await publicQuoteByToken(env, (await bodyOf(request)).token);
  return result ? json(result, 200, origin) : json({ message: "The quotation could not be found." }, 404, origin);
}

async function quoteAccept(request, env, origin) {
  if (!commerceEnabled(env)) return json({ message: "Online quotation acceptance is not active yet." }, 503, origin);
  return json(await acceptQuote(env, (await bodyOf(request)).token), 200, origin);
}

async function adminEndpoint(request, env, origin, action) {
  if (!(await isAdmin(request, env))) return json({ message: "Administrator authorization required." }, 401, origin);
  if (action === "list") return json(await adminList(env), 200, origin);
  const input = await bodyOf(request);
  if (action === "quote") return json(await adminCreateQuote(env, input), 201, origin);
  if (action === "order") return json(await adminUpdateOrder(env, input), 200, origin);
  return json({ message: "Not found" }, 404, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ message: "Origin not allowed" }, 403, env.SITE_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin" } });
    if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/quote/lookup") return await lookupQuote(request, env, origin);
      if (path === "/api/quote/request") return await quoteRequest(request, env, origin);
      if (path === "/api/quote/view") return await quoteView(request, env, origin);
      if (path === "/api/quote/accept") return await quoteAccept(request, env, origin);
      if (path === "/api/payment/init") return await initPayment(request, env, origin);
      if (path === "/api/payment/result") return await paymentResult(request, env, origin);
      if (path === "/api/payment/notification") return await notification(request, env, origin);
      if (path === "/api/admin/list") return await adminEndpoint(request, env, origin, "list");
      if (path === "/api/admin/quote") return await adminEndpoint(request, env, origin, "quote");
      if (path === "/api/admin/order") return await adminEndpoint(request, env, origin, "order");
      return json({ message: "Not found" }, 404, origin);
    } catch (error) {
      const message = String(error?.message || "");
      if (message === "JSON_REQUIRED") return json({ message: "A JSON request body is required." }, 415, origin);
      if (message === "REQUEST_TOO_LARGE") return json({ message: "The request body is too large." }, 413, origin);
      if (message === "JSON_INVALID") return json({ message: "The JSON request body is invalid." }, 400, origin);
      if (message === "PAYMENTS_DISABLED") return json({ message: "Online payments are not active yet." }, 503, origin);
      if (message === "PAYMENT_CONFIGURATION_REQUIRED") return json({ message: "Payment configuration is incomplete." }, 503, origin);
      if (message === "SHIPPING_ADDRESS_REQUIRED") return json({ message: "A complete delivery address is required for this payment." }, 400, origin);
      if (/not found/i.test(message)) return json({ message }, 404, origin);
      if (/expired|cannot be accepted|already paid/i.test(message)) return json({ message }, 409, origin);
      if (/required|invalid|incomplete/i.test(message)) return json({ message }, 400, origin);
      console.error("Unhandled payment service error", error);
      return json({ message: "The secure payment service could not complete this request." }, 500, origin);
    }
  },
  async scheduled(_controller, env, ctx) {
    const timestamp = new Date().toISOString();
    const epoch = Math.floor(Date.now() / 1000);
    ctx.waitUntil(Promise.all([
      env.INVOICES_DB.prepare("DELETE FROM api_rate_limits WHERE expires_at<=?1").bind(epoch).run(),
      env.INVOICES_DB.prepare("DELETE FROM payment_sessions WHERE expires_at<=?1").bind(timestamp).run()
    ]));
  }
};
