import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { priceCart } from "../reduniq-worker/catalog.js";

const root = resolve(import.meta.dirname, "..");

test("temporary REDUNIQ product totals exactly EUR 10.00 including 23% VAT", () => {
  const [line] = priceCart([{ sku: "RP-PAY-TEST-10", size: "Test", quantity: 1, unitPrice: 1 }]);
  assert.equal(line.unitPrice, 813);
  assert.equal(line.lineTotal, 813);
  const tax = Math.round(line.lineTotal * 2300 / 10000);
  assert.equal(tax, 187);
  assert.equal(line.lineTotal + tax, 1000);
});

test("temporary payment test is not linked from public HTML or the sitemap", () => {
  const publicDocuments = readdirSync(root).filter(name => name.endsWith(".html") || name === "sitemap.xml");
  for (const file of publicDocuments) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /payment-test=reduniq-10-eur/);
  }
});
