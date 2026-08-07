import { createAutomaticOrder } from "./commerce-service.js";
import { loadPayableOrder } from "./order-payment-service.js";
import { publicPaymentCapabilities } from "./payment-config.js";
import { getPaymentProvider } from "./payment-provider.js";
import { createPaymentSession, retryPaymentSession, verifyPaymentToken } from "./payment-service.js";
import { bodyOf, enforceRateLimit, jsonResponse, normalize } from "./worker-runtime.js";

const commerceEnabled = env => env.COMMERCE_ENABLED === "true";

export async function paymentCapabilitiesRoute(_request, env, origin) {
  return jsonResponse(publicPaymentCapabilities(env), 200, origin);
}
export async function lookupOrderRoute(request, env, origin) {
  if (!commerceEnabled(env) && env.PAYMENTS_ENABLED !== "true") return jsonResponse({ message: "Online quotation lookup is not active yet." }, 503, origin);
  if (!(await enforceRateLimit(request, env, "lookup"))) return jsonResponse({ message: "Too many attempts. Wait 15 minutes before trying again." }, 429, origin);
  const input = await bodyOf(request); const quote = await loadPayableOrder(env, input.quoteReference, input.email);
  if (!quote) return jsonResponse({ message: "The quotation reference or billing email could not be verified." }, 404, origin);
  if (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now()) return jsonResponse({ message: "This quotation has expired. Request an updated quotation before paying." }, 409, origin);
  if (quote.paymentStatus === "paid") return jsonResponse({ message: "This quotation is already paid." }, 409, origin);
  return jsonResponse({ quoteReference: quote.quoteReference, company: quote.company, subtotal: quote.subtotal, tax: quote.tax, shipping: quote.shipping, total: quote.total, currency: quote.currency || "EUR", expiresAt: quote.expiresAt || null }, 200, origin);
}

export async function initializePaymentRoute(request, env, origin) {
  getPaymentProvider(env).assertAutomaticConfiguration(env);
  if (!(await enforceRateLimit(request, env, "payment"))) return jsonResponse({ message: "Too many payment attempts. Wait 15 minutes before trying again." }, 429, origin);
  return jsonResponse(await createPaymentSession(env, await bodyOf(request)), 200, origin);
}

export async function automaticCheckout(request, env, origin) {
  getPaymentProvider(env).assertAutomaticConfiguration(env);
  if (!commerceEnabled(env)) return jsonResponse({ message: "Automated checkout is not active yet." }, 503, origin);
  if (!(await enforceRateLimit(request, env, "checkout"))) return jsonResponse({ message: "Too many checkout attempts. Wait 15 minutes before trying again." }, 429, origin);
  const order = await createAutomaticOrder(env, await bodyOf(request));
  const payment = await createPaymentSession(env, { quoteReference: order.quoteReference, email: order.customerEmail });
  return jsonResponse({ ...payment, orderReference: order.orderReference }, 200, origin);
}

export async function paymentResultRoute(request, env, origin) {
  getPaymentProvider(env).assertAutomaticConfiguration(env);
  if (!(await enforceRateLimit(request, env, "result"))) return jsonResponse({ message: "Too many verification attempts. Wait before trying again." }, 429, origin);
  const verified = await verifyPaymentToken(env, (await bodyOf(request)).token);
  if (!verified) return jsonResponse({ message: "The payment session was not found." }, 404, origin);
  if (!verified.paid) {
    const messages = {
      failed: "REDUNIQ reported that the payment failed. No payment was recorded.",
      canceled: "The REDUNIQ payment was canceled. No payment was recorded.",
      unconfirmed: "REDUNIQ has not confirmed the payment yet. Check again before starting another attempt.",
    };
    return jsonResponse({ status: verified.outcome, message: messages[verified.outcome], retryAllowed: verified.outcome !== "unconfirmed", retryUrl: `${env.SITE_ORIGIN || "https://rivalpraxis.com"}/order.html` }, verified.outcome === "unconfirmed" ? 202 : 409, origin);
  }
  const order = await env.INVOICES_DB.prepare("SELECT order_reference,status FROM orders WHERE quote_reference=?1").bind(verified.session.quoteReference).first();
  const paymentRecord = await env.INVOICES_DB.prepare("SELECT record_reference,verified_at,confirmation_html FROM payment_transactions WHERE provider_transaction_id=?1").bind(normalize(verified.transactionId, 80)).first();
  return jsonResponse({ status: "paid", orderReference: order?.order_reference, orderStatus: order?.status, paymentRecordReference: paymentRecord?.record_reference, verifiedAt: paymentRecord?.verified_at, confirmationHtml: paymentRecord?.confirmation_html, transactionId: normalize(verified.transactionId, 50), total: verified.session.total, currency: verified.session.currency }, 200, origin);
}

export async function retryPaymentRoute(request, env, origin) {
  if (!(await enforceRateLimit(request, env, "retry"))) return jsonResponse({ message: "Too many retry attempts. Wait before trying again." }, 429, origin);
  return jsonResponse(await retryPaymentSession(env, (await bodyOf(request)).token), 200, origin);
}

export async function paymentNotificationRoute(request, env, origin) {
  const provider = getPaymentProvider(env); const capabilities = provider.assertAutomaticConfiguration(env);
  if (!capabilities.webhooks.enabled) throw new Error("PAYMENT_WEBHOOKS_DISABLED");
  if (Number(request.headers.get("Content-Length") || 0) > 65536) return jsonResponse({ message: "Notification is too large" }, 413, origin);
  const type = request.headers.get("Content-Type") || ""; let token = "";
  if (type.includes("application/json")) token = (await bodyOf(request)).token;
  else if (type.includes("application/x-www-form-urlencoded")) { const text = await request.text(); if (text.length > 65536) return jsonResponse({ message: "Notification is too large" }, 413, origin); const form = new URLSearchParams(text); token = form.get("TOKEN") || form.get("token"); }
  else { const form = await request.formData(); token = form.get("TOKEN") || form.get("token"); }
  if (!token) return jsonResponse({ message: "Missing token" }, 400, origin);
  const verified = await verifyPaymentToken(env, token);
  return jsonResponse({ received: true, status: verified?.outcome || "unconfirmed", paid: Boolean(verified?.paid) }, 200, origin);
}
