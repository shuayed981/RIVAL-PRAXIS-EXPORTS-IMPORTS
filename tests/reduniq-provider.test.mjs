import test from "node:test";
import assert from "node:assert/strict";
import { buildReduniqPaymentPayload, classifyReduniqPayment, redactReduniqRequest, redactReduniqResponse, verifyReduniqPayment } from "../reduniq-worker/reduniq-provider.js";
import { paymentCapabilities } from "../reduniq-worker/payment-config.js";

const successful = (amount, code = "10000000") => ({
  result: { code },
  transaction: { status: 4, id: "txn-123" },
  payment: { amount },
});

test("classifies failed, canceled, and unconfirmed outcomes without assuming success", () => {
  assert.equal(classifyReduniqPayment({ result: { code: "declined" }, transaction: { status: 3, id: "txn-failed" }, payment: { amount: 12345 } }, 12345).outcome, "failed");
  assert.equal(classifyReduniqPayment({ result: { code: "canceled", message: "Payment canceled by customer" }, transaction: { status: 3, id: "txn-canceled" }, payment: { amount: 12345 } }, 12345).outcome, "canceled");
  assert.equal(classifyReduniqPayment({ result: { code: "pending" }, transaction: { status: 2 }, payment: { amount: 12345 } }, 12345).outcome, "unconfirmed");
});

test("accepts only REDUNIQ status 4 with a transaction ID and exact amount", () => {
  assert.equal(verifyReduniqPayment(successful(12345), 12345).paid, true);
  assert.equal(verifyReduniqPayment(successful(12345, "7000000000"), 12345).paid, true);
  assert.equal(verifyReduniqPayment(successful(12344), 12345).paid, false);
  assert.equal(verifyReduniqPayment({ ...successful(12345), transaction: { status: 3, id: "txn-123" } }, 12345).paid, false);
  assert.equal(verifyReduniqPayment({ ...successful(12345), transaction: { status: 4 } }, 12345).paid, false);
});

const automaticEnv = {
  PAYMENT_PROVIDER: "reduniq",
  PAYMENTS_ENABLED: "true",
  REDUNIQ_INTEGRATION_MODE: "api-gateway",
  REDUNIQ_API_PAYMENTS_ENABLED: "true",
  REDUNIQ_PAYMENT_SOLUTION: "999",
  REDUNIQ_API_USERNAME: "sandbox-user",
  REDUNIQ_API_PASSWORD: "sandbox-password",
};

test("optional merchant capabilities are explicit and default off", () => {
  const current = paymentCapabilities({
    PAYMENT_PROVIDER: "reduniq",
    REDUNIQ_INTEGRATION_MODE: "hosted-link",
    REDUNIQ_HOSTED_LINK: "https://pagamentos.reduniq.pt/pay-by-link/3216895/rivalpraxis",
  });
  assert.equal(current.hostedLink.enabled, true);
  assert.equal(current.apiPayments.enabled, false);
  assert.equal(current.webhooks.enabled, false);
  assert.equal(current.cards.enabled, false);
  assert.equal(current.mbWay.enabled, false);
  assert.equal(current.installments.enabled, false);
});

test("notification callback is added only when the webhook flag is enabled", () => {
  const quote = { quoteReference: "RP-AUTO-TEST", total: 12345, subtotal: 10000, tax: 2345, shipping: 0, firstName: "Test", lastName: "Buyer", email: "buyer@example.test", phone: "+351910000000", billing: { street1: "Street", city: "Lisbon", zipCode: "1000-000", country: "pt" }, tin: "500000000" };
  const urls = { returnUrlOk: "https://rivalpraxis.com/payment-status.html", returnUrlError: "https://rivalpraxis.com/payment-status.html?result=error", notificationUrl: "https://payments.rivalpraxis.com/api/payment/notification" };
  assert.equal(buildReduniqPaymentPayload(automaticEnv, quote, urls).notificationUrl, undefined);
  assert.equal(buildReduniqPaymentPayload({ ...automaticEnv, REDUNIQ_WEBHOOKS_ENABLED: "true" }, quote, urls).notificationUrl, urls.notificationUrl);
});

test("payment solution is optional and omitted when REDUNIQ should show enabled methods", () => {
  const quote = { quoteReference: "RP-AUTO-TEST", total: 12345, subtotal: 10000, tax: 2345, shipping: 0, firstName: "Test", lastName: "Buyer", email: "buyer@example.test", phone: "+351910000000", billing: { street1: "Street", city: "Lisbon", zipCode: "1000-000", country: "pt" }, tin: "500000000" };
  const urls = { returnUrlOk: "https://rivalpraxis.com/payment-status.html", returnUrlError: "https://rivalpraxis.com/payment-status.html?result=error", notificationUrl: "https://payments.rivalpraxis.com/api/payment/notification" };
  const payload = buildReduniqPaymentPayload({ ...automaticEnv, REDUNIQ_PAYMENT_SOLUTION: "" }, quote, urls);
  assert.equal("solution" in payload.payment, false);
});

test("diagnostic logging redacts credentials, tokens, and redirect URLs", () => {
  const request = redactReduniqRequest({ method: "initPayment", api: { username: "3216895", password: "secret" }, payment: { amount: 1000 } });
  const response = redactReduniqResponse({ result: { code: "00000001", message: "Rejected" }, token: "secret-token", redirectUrl: "https://example.test/token" });
  assert.deepEqual(request.api, { username: "[REDACTED]", password: "[REDACTED]" });
  assert.equal(request.payment.amount, 1000);
  assert.equal(response.token, "[REDACTED]");
  assert.equal(response.redirectUrl, "[REDACTED]");
  assert.deepEqual(response.result, { code: "00000001", message: "Rejected" });
});
