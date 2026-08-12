import { createQuoteRequest, publicQuoteByToken, acceptQuote, adminList, adminCreateQuote, adminUpdateOrder } from "./commerce-service.js";
import {
  automaticCheckout,
  initializePaymentRoute,
  lookupOrderRoute,
  paymentCapabilitiesRoute,
  paymentNotificationRoute,
  paymentResultRoute,
  retryPaymentRoute,
} from "./payment-routes.js";
import { reconcilePendingPaymentSessions } from "./payment-service.js";
import { allowedOrigin, bodyOf, enforceRateLimit, isAdmin, jsonResponse } from "./worker-runtime.js";

const commerceEnabled = env => env.COMMERCE_ENABLED === "true";

async function quoteRequest(request, env, origin) {
  if (!commerceEnabled(env)) return jsonResponse({ message: "Online quotation requests are not active yet." }, 503, origin);
  if (!(await enforceRateLimit(request, env, "quote-request"))) return jsonResponse({ message: "Too many requests. Please wait before trying again." }, 429, origin);
  return jsonResponse(await createQuoteRequest(env, await bodyOf(request)), 201, origin);
}

async function quoteView(request, env, origin) {
  if (!commerceEnabled(env)) return jsonResponse({ message: "Online quotations are not active yet." }, 503, origin);
  const result = await publicQuoteByToken(env, (await bodyOf(request)).token);
  return result ? jsonResponse(result, 200, origin) : jsonResponse({ message: "The quotation could not be found." }, 404, origin);
}

async function quoteAccept(request, env, origin) {
  if (!commerceEnabled(env)) return jsonResponse({ message: "Online quotation acceptance is not active yet." }, 503, origin);
  const input = await bodyOf(request);
  return jsonResponse(await acceptQuote(env, input.token, input), 200, origin);
}

async function adminEndpoint(request, env, origin, action) {
  if (!(await isAdmin(request, env))) return jsonResponse({ message: "Administrator authorization required." }, 401, origin);
  if (action === "list") return jsonResponse(await adminList(env), 200, origin);
  const input = await bodyOf(request);
  if (action === "quote") return jsonResponse(await adminCreateQuote(env, input), 201, origin);
  if (action === "order") return jsonResponse(await adminUpdateOrder(env, input), 200, origin);
  return jsonResponse({ message: "Not found" }, 404, origin);
}

function knownError(error, origin) {
  const message = String(error?.message || "");
  const exact = {
    JSON_REQUIRED: [415, "A JSON request body is required."],
    REQUEST_TOO_LARGE: [413, "The request body is too large."],
    JSON_INVALID: [400, "The JSON request body is invalid."],
    PAYMENTS_DISABLED: [503, "Online payments are not active yet."],
    AUTOMATIC_VERIFICATION_UNAVAILABLE: [503, "Automatic REDUNIQ verification is not enabled for this merchant account yet."],
    PAYMENT_API_DISABLED: [503, "REDUNIQ API payments are not enabled for this merchant account yet."],
    PAYMENT_WEBHOOKS_DISABLED: [503, "REDUNIQ payment notifications are not enabled for this merchant account yet."],
    PAYMENT_CONFIGURATION_REQUIRED: [503, "Payment configuration is incomplete."],
    PAYMENT_PROVIDER_UNSUPPORTED: [503, "The configured payment provider is not supported."],
    PAYMENT_INITIALIZATION_FAILED: [502, "REDUNIQ could not initialize this payment."],
    PAYABLE_ORDER_NOT_FOUND: [404, "The order could not be verified for payment."],
    PAYMENT_ATTEMPT_NOT_FOUND: [404, "The payment attempt was not found."],
    ORDER_ALREADY_PAID: [409, "This order is already paid."],
    ORDER_EXPIRED: [409, "This order has expired."],
    PAYMENT_RETRY_NOT_ALLOWED: [409, "This payment attempt is not eligible for retry yet."],
  };
  if (exact[message]) return jsonResponse({ message: exact[message][1] }, exact[message][0], origin);
  if (/not found/i.test(message)) return jsonResponse({ message }, 404, origin);
  if (/expired|cannot be accepted|already paid/i.test(message)) return jsonResponse({ message }, 409, origin);
  if (/required|invalid|incomplete/i.test(message)) return jsonResponse({ message }, 400, origin);
  return null;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return jsonResponse({ message: "Origin not allowed" }, 403, env.SITE_ORIGIN);
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin" } });
    const reduniqNotificationGet = request.method === "GET" && path === "/api/payment/notification";
    if (request.method !== "POST" && !reduniqNotificationGet) return jsonResponse({ message: "Method not allowed" }, 405, origin);
    try {
      if (path === "/api/payment/capabilities") return await paymentCapabilitiesRoute(request, env, origin);
      if (path === "/api/quote/lookup") return await lookupOrderRoute(request, env, origin);
      if (path === "/api/quote/request") return await quoteRequest(request, env, origin);
      if (path === "/api/quote/view") return await quoteView(request, env, origin);
      if (path === "/api/quote/accept") return await quoteAccept(request, env, origin);
      if (path === "/api/order/checkout") return await automaticCheckout(request, env, origin);
      if (path === "/api/payment/init") return await initializePaymentRoute(request, env, origin);
      if (path === "/api/payment/result") return await paymentResultRoute(request, env, origin);
      if (path === "/api/payment/retry") return await retryPaymentRoute(request, env, origin);
      if (path === "/api/payment/notification") return await paymentNotificationRoute(request, env, origin);
      if (path === "/api/admin/list") return await adminEndpoint(request, env, origin, "list");
      if (path === "/api/admin/quote") return await adminEndpoint(request, env, origin, "quote");
      if (path === "/api/admin/order") return await adminEndpoint(request, env, origin, "order");
      return jsonResponse({ message: "Not found" }, 404, origin);
    } catch (error) {
      const response = knownError(error, origin);
      if (response) return response;
      console.error(JSON.stringify({ event: "payment_service_error", message: String(error?.message || "unknown") }));
      return jsonResponse({ message: "The secure payment service could not complete this request." }, 500, origin);
    }
  },
  async scheduled(_controller, env, ctx) {
    const timestamp = new Date().toISOString(); const epoch = Math.floor(Date.now() / 1000);
    ctx.waitUntil(Promise.all([
      env.INVOICES_DB.prepare("DELETE FROM api_rate_limits WHERE expires_at<=?1").bind(epoch).run(),
      reconcilePendingPaymentSessions(env),
      env.INVOICES_DB.prepare("DELETE FROM payment_sessions WHERE expires_at<=?1").bind(timestamp).run(),
    ]));
  },
};
