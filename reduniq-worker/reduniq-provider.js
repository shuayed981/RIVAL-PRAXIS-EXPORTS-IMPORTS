import { paymentCapabilities } from "./payment-config.js";
import { normalize, orderDate } from "./worker-runtime.js";

const MAX_GATEWAY_RESPONSE_BYTES = 1048576;
const DEFAULT_PAYMENT_ACTION = 101;

export const REDUNIQ_PROVIDER = "reduniq";

export function reduniqEndpoint(env) {
  const version = env.REDUNIQ_API_VERSION === "6.0" ? "6.0" : "7.0";
  const host = env.REDUNIQ_ENVIRONMENT === "production" ? "pagamentos.reduniq.pt" : "pagamentos.sandbox.reduniq.pt";
  return `https://${host}/api-gateway/v${version}/rest/`;
}

export function reduniqCredentials(env) {
  if (!env.REDUNIQ_API_USERNAME || !env.REDUNIQ_API_PASSWORD) throw new Error("REDUNIQ credentials are not configured");
  return { username: env.REDUNIQ_API_USERNAME, password: env.REDUNIQ_API_PASSWORD };
}

export function assertReduniqAutomaticConfiguration(env) {
  if (env.PAYMENTS_ENABLED !== "true") throw new Error("PAYMENTS_DISABLED");
  const capabilities = paymentCapabilities(env);
  if (capabilities.mode !== "api-gateway") throw new Error("AUTOMATIC_VERIFICATION_UNAVAILABLE");
  if (!capabilities.apiPayments.enabled) throw new Error("PAYMENT_API_DISABLED");
  reduniqCredentials(env);
  return capabilities;
}

export async function callReduniq(env, payload) {
  const response = await fetch(reduniqEndpoint(env), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
  if (Number(response.headers.get("Content-Length") || 0) > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("Gateway response is too large");
  const text = await response.text();
  if (text.length > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("Gateway response is too large");
  try { return JSON.parse(text); } catch { throw new Error("Gateway returned invalid JSON"); }
}

export function buildReduniqPaymentPayload(env, quote, urls) {
  const capabilities = assertReduniqAutomaticConfiguration(env);
  const action = Number(env.REDUNIQ_PAYMENT_ACTION || DEFAULT_PAYMENT_ACTION);
  if (!Number.isSafeInteger(action) || action <= 0) throw new Error("PAYMENT_CONFIGURATION_REQUIRED");
  const payload = {
    method: "initPayment",
    api: reduniqCredentials(env),
    payment: {
      amount: quote.total,
      action,
      deadline: "",
      description: `RIVAL PRAXIS order ${quote.quoteReference}`,
    },
    order: {
      ref: `${quote.quoteReference}-${Date.now()}`.slice(0, 50),
      amount: quote.subtotal,
      taxes: quote.tax,
      date: orderDate(),
      shipping: quote.shipping > 0 ? "1" : "0",
      details: [{ name: `Wholesale order ${quote.quoteReference}`.slice(0, 50), amount: quote.subtotal, tax: quote.tax, quantity: 1, category: "1" }],
    },
    buyer: {
      firstName: normalize(quote.firstName, 50),
      lastName: normalize(quote.lastName, 50),
      email: normalize(quote.email),
      phone: normalize(quote.phone, 15),
      billing: {
        street1: normalize(quote.billing?.street1, 100),
        street2: normalize(quote.billing?.street2, 100),
        city: normalize(quote.billing?.city, 40),
        state: normalize(quote.billing?.state, 40),
        zipCode: normalize(quote.billing?.zipCode, 20),
        country: normalize(quote.billing?.country || "pt", 2),
        tin: normalize(quote.tin, 20),
      },
    },
    mode: "redirect",
    returnUrlOk: urls.returnUrlOk,
    returnUrlError: urls.returnUrlError,
    privateData: [{ name: "quoteReference", value: quote.quoteReference }],
    languageCode: "eng",
  };
  const solution = normalize(env.REDUNIQ_PAYMENT_SOLUTION, 3);
  if (solution) payload.payment.solution = solution;
  if (capabilities.webhooks.enabled) payload.notificationUrl = urls.notificationUrl;
  return payload;
}

export function classifyReduniqPayment(result, expectedAmount) {
  const gatewayAmount = Number(result?.payment?.amount ?? result?.paymentAmount);
  const resultCode = String(result?.result?.code || "");
  const providerMessage = String(result?.result?.message || "").trim().slice(0, 255);
  const transactionStatus = Number(result?.transaction?.status);
  const transactionId = String(result?.transaction?.id || "").trim().slice(0, 80);
  const paid = transactionStatus === 4
    && Boolean(transactionId)
    && Number.isSafeInteger(gatewayAmount)
    && gatewayAmount === expectedAmount;
  let outcome = "unconfirmed";
  if (paid) outcome = "paid";
  else if (transactionStatus === 3 && /cancel|cancelad|anulad|aborted/i.test(providerMessage)) outcome = "canceled";
  else if (transactionStatus === 3) outcome = "failed";
  return { paid, outcome, gatewayAmount, resultCode, providerMessage, transactionStatus, transactionId };
}

export const verifyReduniqPayment = classifyReduniqPayment;

export const reduniqProvider = Object.freeze({
  id: REDUNIQ_PROVIDER,
  capabilities: paymentCapabilities,
  assertAutomaticConfiguration: assertReduniqAutomaticConfiguration,
  async initializePayment(env, { quote, urls }) {
    const result = await callReduniq(env, buildReduniqPaymentPayload(env, quote, urls));
    if (result?.result?.code !== "00000000" || !result.token || !result.redirectUrl) throw new Error("PAYMENT_INITIALIZATION_FAILED");
    return { provider: REDUNIQ_PROVIDER, token: result.token, redirectUrl: result.redirectUrl, raw: result };
  },
  async verifyPayment(env, token, expectedAmount) {
    assertReduniqAutomaticConfiguration(env);
    const raw = await callReduniq(env, { method: "getResult", api: reduniqCredentials(env), token });
    return { provider: REDUNIQ_PROVIDER, ...classifyReduniqPayment(raw, expectedAmount), raw };
  },
});
