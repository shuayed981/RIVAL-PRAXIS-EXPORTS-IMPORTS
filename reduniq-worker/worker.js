const gatewayEndpoint = (env) => {
  const version = env.REDUNIQ_API_VERSION === "6.0" ? "6.0" : "7.0";
  const host = env.REDUNIQ_ENVIRONMENT === "production" ? "pagamentos.reduniq.pt" : "pagamentos.sandbox.reduniq.pt";
  return `https://${host}/api-gateway/v${version}/rest/`;
};
const SESSION_TTL_SECONDS = 86400 * 7;
const RATE_WINDOW_SECONDS = 60 * 15;
const RATE_LIMIT = 12;

const json = (body, status = 200, origin = "https://rivalpraxis.com") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  }
});

const normalize = (value, max = 150) => String(value || "").trim().slice(0, max);
const quoteKey = (reference) => `quote:${normalize(reference, 50).toUpperCase()}`;
const tokenKey = (token) => `token:${normalize(token, 80)}`;
const rateKey = (request, action) => {
  const address = normalize(request.headers.get("CF-Connecting-IP") || "unknown", 64);
  return `rate:${action}:${address}`;
};
const auditKey = (reference) => `audit:${normalize(reference, 50).toUpperCase()}:${Date.now()}:${crypto.randomUUID()}`;
const orderDate = () => new Date().toISOString().slice(0, 19).replace("T", " ");

function allowedOrigin(request, env) {
  const expected = env.SITE_ORIGIN || "https://rivalpraxis.com";
  const origin = request.headers.get("Origin");
  return !origin || origin === expected ? expected : null;
}

async function bodyOf(request) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new Error("JSON_REQUIRED");
  return request.json();
}

async function enforceRateLimit(request, env, action) {
  const key = rateKey(request, action);
  const current = Number(await env.QUOTES.get(key)) || 0;
  if (current >= RATE_LIMIT) return false;
  await env.QUOTES.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS });
  return true;
}

async function audit(env, reference, event, details = {}) {
  await env.QUOTES.put(auditKey(reference), JSON.stringify({
    event,
    quoteReference: normalize(reference, 50).toUpperCase(),
    at: new Date().toISOString(),
    ...details
  }));
}

async function getApprovedQuote(env, quoteReference, email) {
  const reference = normalize(quoteReference, 50).toUpperCase();
  const normalizedEmail = normalize(email).toLowerCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{3,49}$/.test(reference) || !normalizedEmail.includes("@")) return null;
  const quote = await env.QUOTES.get(quoteKey(reference), "json");
  if (!quote || quote.status !== "approved" || String(quote.email || "").toLowerCase() !== normalizedEmail) return null;
  if (![quote.subtotal, quote.tax, quote.shipping, quote.total].every(Number.isSafeInteger)) return null;
  if (quote.total !== quote.subtotal + quote.tax + quote.shipping || quote.total < 100) return null;
  return { ...quote, quoteReference: reference };
}

async function gateway(env, payload) {
  const response = await fetch(gatewayEndpoint(env), { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
  return response.json();
}

function apiCredentials(env) {
  if (!env.REDUNIQ_API_USERNAME || !env.REDUNIQ_API_PASSWORD) throw new Error("REDUNIQ credentials are not configured");
  return { username: env.REDUNIQ_API_USERNAME, password: env.REDUNIQ_API_PASSWORD };
}

function publicQuote(quote) {
  return { quoteReference: quote.quoteReference, company: quote.company, subtotal: quote.subtotal, tax: quote.tax, shipping: quote.shipping, total: quote.total, currency: quote.currency || "EUR", expiresAt: quote.expiresAt || null };
}

async function lookupQuote(request, env, origin) {
  if (!(await enforceRateLimit(request, env, "lookup"))) return json({ message: "Too many attempts. Wait 15 minutes before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const quote = await getApprovedQuote(env, input.quoteReference, input.email);
  if (!quote) return json({ message: "The quotation reference or billing email could not be verified." }, 404, origin);
  if (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now()) return json({ message: "This quotation has expired. Request an updated quotation before paying." }, 409, origin);
  if (quote.paymentStatus === "paid") return json({ message: "This quotation is already paid." }, 409, origin);
  return json(publicQuote(quote), 200, origin);
}

async function initPayment(request, env, origin) {
  if (!(await enforceRateLimit(request, env, "payment"))) return json({ message: "Too many payment attempts. Wait 15 minutes before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const quote = await getApprovedQuote(env, input.quoteReference, input.email);
  if (!quote) return json({ message: "The quotation could not be verified." }, 404, origin);
  if (quote.paymentStatus === "paid") return json({ message: "This quotation is already paid." }, 409, origin);
  if (quote.paymentToken && quote.paymentTokenCreatedAt && Date.now() - Date.parse(quote.paymentTokenCreatedAt) < SESSION_TTL_SECONDS * 1000) {
    const existingSession = await env.QUOTES.get(tokenKey(quote.paymentToken), "json");
    if (existingSession?.redirectUrl) return json({ token: quote.paymentToken, redirectUrl: existingSession.redirectUrl }, 200, origin);
  }
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
      details: (quote.items || [{ name: `Wholesale quotation ${quote.quoteReference}`, amount: quote.subtotal, tax: quote.tax, quantity: 1 }]).slice(0, 100).map((item) => ({ name: normalize(item.name, 50), amount: Number(item.amount) || 0, tax: Number(item.tax) || 0, quantity: Number(item.quantity) || 1, category: "1" }))
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
  if (quote.shipping > 0 && quote.shippingAddress) payload.buyer.shipping = { name: normalize(quote.shippingAddress.name, 32), street1: normalize(quote.shippingAddress.street1, 100), street2: normalize(quote.shippingAddress.street2, 100), city: normalize(quote.shippingAddress.city, 40), state: normalize(quote.shippingAddress.state, 40), zipCode: normalize(quote.shippingAddress.zipCode, 20), country: normalize(quote.shippingAddress.country || "pt", 2), phone: normalize(quote.phone, 15), amount: quote.shipping };
  const result = await gateway(env, payload);
  if (result?.result?.code !== "00000000" || !result.token || !result.redirectUrl) return json({ message: "REDUNIQ could not initialize this payment." }, 502, origin);
  const createdAt = new Date().toISOString();
  await env.QUOTES.put(tokenKey(result.token), JSON.stringify({ quoteReference: quote.quoteReference, total: quote.total, currency: quote.currency || "EUR", redirectUrl: result.redirectUrl, createdAt }), { expirationTtl: SESSION_TTL_SECONDS });
  await env.QUOTES.put(quoteKey(quote.quoteReference), JSON.stringify({ ...quote, paymentStatus: "pending", paymentToken: result.token, paymentTokenCreatedAt: createdAt }));
  await audit(env, quote.quoteReference, "payment_initialized", { token: result.token });
  return json({ token: result.token, redirectUrl: result.redirectUrl }, 200, origin);
}

async function verifyToken(env, token) {
  const normalizedToken = normalize(token, 80);
  const session = await env.QUOTES.get(tokenKey(normalizedToken), "json");
  if (!session) return null;
  const result = await gateway(env, { method: "getResult", api: apiCredentials(env), token: normalizedToken });
  const gatewayAmount = Number(result?.payment?.amount ?? result?.paymentAmount);
  const resultCode = String(result?.result?.code || "");
  // REDUNIQ specifies transaction.status as the authoritative success field.
  // An exact server-side amount match remains mandatory before fulfilment.
  const paid = Number(result?.transaction?.status) === 4 && Number.isSafeInteger(gatewayAmount) && gatewayAmount === session.total;
  if (paid) {
    const key = quoteKey(session.quoteReference);
    const quote = await env.QUOTES.get(key, "json");
    if (quote && quote.paymentStatus !== "paid") {
      const transactionId = normalize(result?.transaction?.id, 50);
      await env.QUOTES.put(key, JSON.stringify({ ...quote, paymentStatus: "paid", paidAt: new Date().toISOString(), transactionId }));
      await audit(env, session.quoteReference, "payment_confirmed", { transactionId, total: session.total, currency: session.currency, resultCode });
    }
  }
  return { paid, session, result };
}

async function paymentResult(request, env, origin) {
  if (!(await enforceRateLimit(request, env, "result"))) return json({ message: "Too many verification attempts. Wait before trying again." }, 429, origin);
  const input = await bodyOf(request);
  const verified = await verifyToken(env, input.token);
  if (!verified) return json({ message: "The payment session was not found." }, 404, origin);
  if (!verified.paid) return json({ status: "not_paid", message: "REDUNIQ has not confirmed this payment. Do not submit another payment until support checks the transaction." }, 409, origin);
  return json({ status: "paid", quoteReference: verified.session.quoteReference, transactionId: normalize(verified.result?.transaction?.id, 50), total: verified.session.total, currency: verified.session.currency }, 200, origin);
}

async function notification(request, env, origin) {
  let token = "";
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) token = (await request.json()).token;
  else { const form = await request.formData(); token = form.get("TOKEN") || form.get("token"); }
  if (!token) return json({ message: "Missing token" }, 400, origin);
  const verified = await verifyToken(env, token);
  return json({ received: true, paid: Boolean(verified?.paid) }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ message: "Origin not allowed" }, 403, env.SITE_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS", "Vary": "Origin" } });
    if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/quote/lookup") return lookupQuote(request, env, origin);
      if (path === "/api/payment/init") return initPayment(request, env, origin);
      if (path === "/api/payment/result") return paymentResult(request, env, origin);
      if (path === "/api/payment/notification") return notification(request, env, origin);
      return json({ message: "Not found" }, 404, origin);
    } catch (error) {
      console.error(error);
      return json({ message: "The secure payment service could not complete this request." }, 500, origin);
    }
  }
};
