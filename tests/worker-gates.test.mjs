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

test("untrusted browser origins are rejected", async () => {
  const response = await worker.fetch(request("/api/payment/init", "https://attacker.invalid"), env);
  assert.equal(response.status, 403);
});
