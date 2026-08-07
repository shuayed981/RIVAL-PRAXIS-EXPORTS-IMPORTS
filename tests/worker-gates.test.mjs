import test from "node:test";
import assert from "node:assert/strict";
import worker from "../reduniq-worker/worker.js";

const request = (path, origin = "https://rivalpraxis.com") => new Request(`https://payments.rivalpraxis.com${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": origin },
  body: JSON.stringify({ quoteReference: "RP-Q-TEST", email: "buyer@example.test" })
});

const env = {
  SITE_ORIGIN: "https://rivalpraxis.com",
  PAYMENTS_ENABLED: "false",
  COMMERCE_ENABLED: "false"
};

test("payment initialization fails closed before any database or gateway call", async () => {
  const response = await worker.fetch(request("/api/payment/init"), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "Online payments are not active yet." });
});

test("commerce endpoints fail closed before activation", async () => {
  const response = await worker.fetch(request("/api/quote/request"), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "Online quotation requests are not active yet." });
});

test("automated checkout fails closed before activation", async () => {
  const response = await worker.fetch(request("/api/order/checkout"), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "Online payments are not active yet." });
});

test("hosted-link account cannot claim automatic verification", async () => {
  const response = await worker.fetch(request("/api/order/checkout"), {
    ...env,
    PAYMENTS_ENABLED: "true",
    COMMERCE_ENABLED: "true",
    REDUNIQ_INTEGRATION_MODE: "hosted-link"
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "Automatic REDUNIQ verification is not enabled for this merchant account yet." });
});

test("api-gateway mode also requires its explicit capability flag", async () => {
  const response = await worker.fetch(request("/api/order/checkout"), {
    ...env,
    PAYMENTS_ENABLED: "true",
    COMMERCE_ENABLED: "true",
    REDUNIQ_INTEGRATION_MODE: "api-gateway"
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "REDUNIQ API payments are not enabled for this merchant account yet." });
});

test("capabilities endpoint reports the current hosted-link flow without claiming extras", async () => {
  const response = await worker.fetch(request("/api/payment/capabilities"), {
    ...env,
    PAYMENT_PROVIDER: "reduniq",
    REDUNIQ_INTEGRATION_MODE: "hosted-link",
    REDUNIQ_HOSTED_LINK: "https://pagamentos.reduniq.pt/pay-by-link/3216895/rivalpraxis"
  });
  assert.equal(response.status, 200);
  const capabilities = await response.json();
  assert.equal(capabilities.hostedLink.enabled, true);
  for (const feature of ["apiPayments", "webhooks", "cards", "mbWay", "installments"]) assert.equal(capabilities[feature].enabled, false);
});

test("untrusted browser origins are rejected", async () => {
  const response = await worker.fetch(request("/api/payment/init", "https://attacker.invalid"), env);
  assert.equal(response.status, 403);
});
