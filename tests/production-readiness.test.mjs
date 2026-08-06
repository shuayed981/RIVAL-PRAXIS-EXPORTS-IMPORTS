import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(join(root, path), "utf8");

test("all local scripts and styles referenced by public pages exist", () => {
  for (const file of readdirSync(root).filter(name => name.endsWith(".html"))) {
    const html = read(file);
    for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+\.(?:js|css))["']/gi)) {
      assert.ok(existsSync(join(root, match[1])), `${file} references missing ${match[1]}`);
    }
  }
});

test("all local images referenced by public pages exist", () => {
  for (const file of readdirSync(root).filter(name => name.endsWith(".html"))) {
    const html = read(file);
    for (const match of html.matchAll(/(?:src|poster)=["']([^"'#?]+\.(?:avif|gif|jpe?g|png|svg|webp))["']/gi)) {
      assert.ok(existsSync(join(root, match[1])), `${file} references missing ${match[1]}`);
    }
  }
});

test("all local assets referenced by stylesheets exist", () => {
  for (const file of readdirSync(root).filter(name => name.endsWith(".css"))) {
    const css = read(file);
    for (const match of css.matchAll(/url\(["']?([^"')#?]+)["']?\)/gi)) {
      if (/^(?:data:|https?:|\/\/)/i.test(match[1])) continue;
      assert.ok(existsSync(join(root, match[1])), `${file} references missing ${match[1]}`);
    }
  }
});

test("merchant identity and complete street address are consistent", () => {
  for (const file of ["index.html", "merchant-information.html", "pay.html", "terms.html", "privacy.html", "cookies.html", "shipping.html", "returns.html", "payments.html"]) {
    assert.match(read(file), /446 R\/C/iu, `${file} lacks the registered street number`);
    assert.match(read(file), /519497074/u, `${file} lacks the merchant tax number`);
  }
});

test("payments and commerce fail closed before activation", () => {
  const config = read("payment-config.js");
  const workerConfig = read("reduniq-worker/wrangler.jsonc");
  assert.match(config, /enabled:\s*false/);
  assert.match(config, /commerceEnabled:\s*false/);
  assert.match(workerConfig, /"PAYMENTS_ENABLED":\s*"false"/);
  assert.match(workerConfig, /"COMMERCE_ENABLED":\s*"false"/);
});

test("payment success is server verified and exact-amount checked", () => {
  const worker = read("reduniq-worker/worker.js");
  assert.match(worker, /transaction\?\.status\) === 4/);
  assert.match(worker, /resultCode === "00000000"/);
  assert.match(worker, /gatewayAmount === session\.total/);
  assert.match(worker, /Boolean\(transactionId\)/);
  assert.match(worker, /SHIPPING_ADDRESS_REQUIRED/);
  assert.match(worker, /amount: quote\.subtotal, tax: quote\.tax, quantity: 1/);
});

test("payment state, rate limits, and audits use D1 rather than public KV", () => {
  const worker = read("reduniq-worker/worker.js");
  assert.doesNotMatch(worker, /env\.QUOTES/);
  assert.match(worker, /payment_sessions/);
  assert.match(worker, /api_rate_limits/);
  assert.match(worker, /commerce_events/);
});

test("payment receipt, notifications and fulfilment are automatic after verification", () => {
  const worker = read("reduniq-worker/worker.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  const statusPage = read("payment-status.html");
  assert.match(worker, /ensurePaymentReceipt/);
  assert.match(worker, /fulfillment-/);
  assert.match(commerce, /receipt_generated/);
  assert.match(commerce, /fulfillment_triggered/);
  assert.match(commerce, /status='processing'/);
  assert.doesNotMatch(`${worker}${statusPage}`, /manual invoice|required.*manual|prepared manually/i);
  assert.match(statusPage, /automatically generated payment receipt/i);
  assert.match(statusPage, /Print payment confirmation/);
});

test("billing and quotation records include the required business and legal fields", () => {
  const orderPage = read("order.html");
  const quotePage = read("quote.html");
  const quoteScript = read("quote.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  assert.match(orderPage, /name="registrationNumber"[^>]*required/);
  assert.match(orderPage, /name="legalConsent"[^>]*required/);
  assert.match(quotePage, /id="quote-reference"/);
  assert.match(quotePage, /id="quote-date"/);
  assert.match(quotePage, /id="quote-registration"/);
  assert.match(quotePage, /id="quote-legal-consent"/);
  assert.match(quoteScript, /termsAccepted: true, privacyAccepted: true/);
  assert.match(commerce, /Terms and Privacy acceptance is required/);
  assert.doesNotMatch(`${orderPage}${quotePage}${read("pay.html")}`, /type="(?:text|password)"[^>]*(?:card|cvv|cvc)|name="(?:card|cvv|cvc)/i);
});

test("normal checkout bypasses quotation request, review, acceptance and lookup", () => {
  const orderPage = read("order.html");
  const orderScript = read("order.js");
  const worker = read("reduniq-worker/worker.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  assert.match(orderScript, /\/order\/checkout/);
  assert.doesNotMatch(orderScript, /\/quote\/request|mailto:|Request Confirmed Quote/);
  assert.doesNotMatch(orderPage, /Pay a Quote|confirmed quotation/i);
  assert.match(orderPage, /No quotation or staff approval is required/i);
  assert.match(worker, /automaticCheckout/);
  assert.match(commerce, /createAutomaticOrder/);
});

test("automated checkout prices SKUs and MOQ from the server catalogue", () => {
  const catalogue = read("reduniq-worker/catalog.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  assert.match(catalogue, /RP-\$\{code\}/);
  assert.match(catalogue, /quantity < product\.moq/);
  assert.match(commerce, /priceCart\(input\.items\)/);
});

test("administrator token remains memory-only and expires", () => {
  const admin = read("admin.js");
  assert.doesNotMatch(admin, /(?:local|session)Storage/);
  assert.match(admin, /SESSION_MS = 15 \* 60 \* 1000/);
  assert.match(admin, /expiresAt <= Date\.now\(\)/);
});

test("Pages deployment excludes backend and internal documentation", () => {
  const workflow = read(".github/workflows/static.yml");
  assert.match(workflow, /Build public-site artifact/);
  assert.match(workflow, /Private backend or documentation files entered the public artifact/);
  assert.doesNotMatch(workflow, /path:\s*['"]?\.['"]?\s*$/m);
});

test("the complete D1 schema is tracked as the first deployment migration", () => {
  const baseMigration = read("reduniq-worker/migrations/0001-commerce-schema.sql");
  for (const table of ["quote_requests", "commerce_quotes", "orders", "commerce_events", "payment_sessions", "api_rate_limits", "email_events"]) {
    assert.match(baseMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("automatic payment receipts are tracked in a deployment migration", () => {
  const migration = read("reduniq-worker/migrations/0002-automatic-checkout.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_receipts/);
  assert.match(migration, /transaction_id TEXT NOT NULL UNIQUE/);
});
