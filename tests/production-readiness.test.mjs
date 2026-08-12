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

test("payments and commerce are explicitly activated in production", () => {
  const config = read("payment-config.js");
  const workerConfig = read("reduniq-worker/wrangler.jsonc");
  assert.match(config, /enabled:\s*true/);
  assert.match(config, /commerceEnabled:\s*true/);
  assert.match(workerConfig, /"PAYMENTS_ENABLED":\s*"true"/);
  assert.match(workerConfig, /"COMMERCE_ENABLED":\s*"true"/);
  assert.match(workerConfig, /"AUTOMATED_CHECKOUT_RULES":\s*"\{\\"PT\\":\{\\"taxRateBps\\":2300\}\}"/);
});

test("payment success is server verified and exact-amount checked", () => {
  const provider = read("reduniq-worker/reduniq-provider.js");
  assert.match(provider, /transactionStatus === 4/);
  assert.doesNotMatch(provider, /resultCode === "00000000"/);
  assert.match(provider, /gatewayAmount === expectedAmount/);
  assert.match(provider, /Boolean\(transactionId\)/);
  assert.match(provider, /amount: quote\.subtotal, tax: quote\.tax, quantity: 1/);
});

test("payment state, rate limits, and audits use D1 rather than public KV", () => {
  const services = read("reduniq-worker/payment-service.js") + read("reduniq-worker/worker-runtime.js");
  assert.doesNotMatch(services, /env\.QUOTES/);
  assert.match(services, /payment_sessions/);
  assert.match(services, /api_rate_limits/);
  assert.match(services, /commerce_events/);
});

test("payment transaction, notifications and paid status are automatic after verification", () => {
  const payment = read("reduniq-worker/payment-service.js");
  const records = read("reduniq-worker/payment-record-service.js");
  const orders = read("reduniq-worker/order-payment-service.js");
  const statusPage = read("payment-status.html");
  assert.match(payment, /ensurePaymentTransaction/);
  assert.match(records, /payment_recorded/);
  assert.match(orders, /status='paid'/);
  assert.doesNotMatch(`${payment}${statusPage}`, /fulfillment_triggered|fulfilment started|tax invoice/i);
  assert.match(statusPage, /payment-status record/i);
  assert.match(statusPage, /Download payment confirmation/);
});

test("automatic payment path excludes delivery and invoicing logic", () => {
  const orderPage = read("order.html");
  const provider = read("reduniq-worker/reduniq-provider.js");
  const payment = read("reduniq-worker/payment-service.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  assert.match(orderPage, /Company and billing details/);
  assert.doesNotMatch(orderPage, /Delivery address|Shipping.*Calculated automatically/i);
  assert.doesNotMatch(`${provider}${payment}`, /buyer\.shipping|SHIPPING_ADDRESS_REQUIRED|fulfillment_triggered/i);
  assert.doesNotMatch(commerce, /status='processing'.*transaction_id|fulfillment_triggered/i);
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

test("checkout uses automated REDUNIQ API handoff without quotation lookup", () => {
  const orderPage = read("order.html");
  const orderScript = read("order.js");
  const hostedPaymentPage = read("pay.html");
  const browserConfig = read("payment-config.js");
  const worker = read("reduniq-worker/worker.js");
  const commerce = read("reduniq-worker/commerce-service.js");
  assert.match(orderScript, /\/order\/checkout/);
  assert.doesNotMatch(orderScript, /\/quote\/request|mailto:|Request Confirmed Quote/);
  assert.doesNotMatch(orderPage, /Pay a Quote|confirmed quotation/i);
  assert.match(orderPage, /Verified REDUNIQ checkout is active/i);
  assert.match(browserConfig, /mode:\s*"api-gateway"/);
  assert.match(browserConfig, /provider:\s*"reduniq"/);
  assert.match(hostedPaymentPage, /\.format\(amount\)/);
  assert.doesNotMatch(hostedPaymentPage, /amount\s*\/\s*100|cents\s*\/\s*100/);
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

test("verified provider transactions are tracked in a dedicated migration", () => {
  const migration = read("reduniq-worker/migrations/0003-payment-transactions.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_transactions/);
  assert.match(migration, /provider_transaction_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /record_reference TEXT NOT NULL UNIQUE/);
});

test("every payment attempt is logged and confirmations are stored", () => {
  const migration = read("reduniq-worker/migrations/0004-payment-attempt-lifecycle.sql");
  const worker = read("reduniq-worker/worker.js");
  const routes = read("reduniq-worker/payment-routes.js");
  const payment = read("reduniq-worker/payment-service.js");
  const records = read("reduniq-worker/payment-record-service.js");
  const statusScript = read("payment-status.js");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_attempts/);
  assert.match(migration, /confirmation_html TEXT NOT NULL/);
  assert.match(records, /payment_attempt_initialized/);
  assert.match(records, /payment_attempt_\$\{input\.outcome\}/);
  assert.match(worker, /\/api\/payment\/retry/);
  assert.match(payment, /attachments: \[\{ filename:/);
  assert.match(statusScript, /download-payment-confirmation/);
  assert.match(statusScript, /status === "unconfirmed"/);
  for (const outcome of ["failed", "canceled", "unconfirmed"]) assert.match(routes, new RegExp(`${outcome}:`));
});

test("REDUNIQ provider integration is modular and production API mode is explicit", () => {
  const provider = read("reduniq-worker/reduniq-provider.js");
  const registry = read("reduniq-worker/payment-provider.js");
  const worker = read("reduniq-worker/worker.js");
  const config = read("reduniq-worker/wrangler.jsonc");
  assert.match(provider, /assertReduniqAutomaticConfiguration/);
  assert.match(provider, /verifyReduniqPayment/);
  assert.match(registry, /getPaymentProvider/);
  assert.doesNotMatch(worker, /reduniq-provider|REDUNIQ_API_|initPayment|getResult/);
  assert.match(config, /"REDUNIQ_ENVIRONMENT":\s*"production"/);
  assert.match(config, /"REDUNIQ_INTEGRATION_MODE":\s*"api-gateway"/);
  assert.match(config, /"REDUNIQ_API_PAYMENTS_ENABLED":\s*"true"/);
  assert.match(config, /"REDUNIQ_WEBHOOKS_ENABLED":\s*"true"/);
  assert.match(config, /pay-by-link\/3216895\/rivalpraxis/);
});

test("pending REDUNIQ sessions are reconciled even when return and notification callbacks are missed", () => {
  const payment = read("reduniq-worker/payment-service.js");
  const worker = read("reduniq-worker/worker.js");
  assert.match(payment, /export async function reconcilePendingPaymentSessions/);
  assert.match(payment, /WHERE status='pending' AND expires_at>/);
  assert.match(payment, /await verifyPaymentToken\(env, row\.payment_token\)/);
  assert.match(worker, /reconcilePendingPaymentSessions\(env\)/);
});

test("REDUNIQ GET notification callbacks are accepted and read the query token", () => {
  const worker = read("reduniq-worker/worker.js");
  const routes = read("reduniq-worker/payment-routes.js");
  assert.match(worker, /request\.method === "GET" && path === "\/api\/payment\/notification"/);
  assert.match(routes, /request\.method === "GET"/);
  assert.match(routes, /searchParams\.get\("token"\)/);
});

test("unconfirmed optional REDUNIQ payment methods remain disabled", () => {
  const config = read("reduniq-worker/wrangler.jsonc");
  const capabilities = read("reduniq-worker/payment-config.js");
  for (const flag of ["REDUNIQ_CARD_PAYMENTS_ENABLED", "REDUNIQ_MBWAY_ENABLED", "REDUNIQ_INSTALLMENTS_ENABLED"]) {
    assert.match(config, new RegExp(`"${flag}":\\s*"false"`));
  }
  assert.match(capabilities, /hostedLink/);
  assert.match(capabilities, /apiPayments/);
  assert.match(capabilities, /installments/);
});

test("the live Pay-by-Link target remains unchanged", () => {
  assert.match(read("pay.html"), /https:\/\/pagamentos\.reduniq\.pt\/pay-by-link\/3216895\/rivalpraxis/);
  assert.doesNotMatch(read("pay.html"), /pay-by-link\/3216895\/rivalpraxis\//);
});
