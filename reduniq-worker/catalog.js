const dot = " • ";
const sizes = {
  standard: ["S", "M", "L"].join(dot), standardXL: ["S", "M", "L", "XL"].join(dot),
  youth: ["4Y", "6Y", "8Y", "10Y"].join(dot), xs: ["XS", "S", "M", "L"].join(dot),
  menXL: ["M", "L", "XL"].join(dot), waist: ["30", "32", "34", "36"].join(dot),
  eu: ["48", "50", "52"].join(dot), euXL: ["48", "50", "52", "54"].join(dot),
  shoes: ["EU 36", "EU 37", "EU 38", "EU 39", "EU 40"].join(dot)
};

const groups = {
  WM: {
    prices: [6990,7490,7990,6490,7290,7690,6890,8290,7190,7790,8490,7390,6690,8190,7590,7890,8690,7090,8390,7990,8890,7690,8490,7990,7490,8690,8190,8390,9290,7890],
    sizes: [sizes.standardXL,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.youth,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.standard,sizes.standard,sizes.standardXL,sizes.xs,sizes.standard,sizes.standardXL,sizes.xs,"One Size",sizes.standardXL,sizes.xs,sizes.standardXL,sizes.standardXL,sizes.standard,sizes.xs,sizes.standardXL,sizes.xs,sizes.standardXL,sizes.standardXL,sizes.standard]
  },
  MN: {
    prices: [8990,9490,9990,8490,9290,9690,10490,8790,9890,9190,10690,9390,8890,10190,9590,10390,9090,9790,10890,9990,9490,8990,10990,8690,8290,9190,9690,11990,10490,8490],
    sizes: [sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.waist,sizes.euXL,sizes.menXL,sizes.eu,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.standardXL,sizes.menXL,sizes.waist,sizes.menXL,sizes.menXL,sizes.standardXL,sizes.eu,sizes.euXL,sizes.standardXL,sizes.standardXL,sizes.euXL,sizes.standardXL,sizes.standardXL,sizes.standardXL,sizes.menXL,sizes.euXL,sizes.standardXL,sizes.standardXL]
  },
  AC: {
    prices: [2490,2990,3990,4490,4990,2790,3490,4190,3290,4690,5290,3690,2890,4390,5490,3190,4790,3890,5690,4290],
    sizes: Array.from({ length: 20 }, (_, index) => index === 11 ? sizes.shoes : "One Size")
  }
};

const skuOverrides = Object.freeze({
  "RP-AC-0012": "RP-CAL-201", "RP-AC-0007": "RP-MAL-202", "RP-MN-0014": "RP-CAM-203",
  "RP-MN-0027": "RP-SOB-204", "RP-AC-0004": "RP-OCU-205", "RP-AC-0003": "RP-LOT-206",
  "RP-MN-0022": "RP-VST-101", "RP-WM-0025": "RP-VST-102", "RP-WM-0024": "RP-VST-103",
  "RP-WM-0029": "RP-VST-104", "RP-AC-0010": "RP-ACC-105", "RP-AC-0018": "RP-LOT-106"
});

const catalogue = new Map(Object.entries(groups).flatMap(([code, group]) => group.prices.map((unitPrice, index) => {
  const originalSku = `RP-${code}-${String(index + 1).padStart(4, "0")}`;
  const sku = skuOverrides[originalSku] || originalSku;
  const moq = code === "AC" ? (index < 2 ? 600 : index < 4 ? 500 : 400) : (index < 3 ? 500 : 400);
  return [sku, Object.freeze({ sku, unitPrice, moq, sizes: group.sizes[index].split(dot).map(value => value.trim()) })];
})));

export function priceCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw new Error("At least one valid product is required");
  const seen = new Set();
  const lines = input.map(raw => {
    const sku = String(raw?.sku || raw?.reference || "").trim().toUpperCase();
    const product = catalogue.get(sku);
    const quantity = Number(raw?.quantity);
    const size = String(raw?.size || "").trim();
    const key = `${sku}\u0000${size}`;
    if (!product) throw new Error(`Product ${sku || "reference"} is invalid`);
    if (!Number.isSafeInteger(quantity) || quantity < product.moq || quantity > 1000000) throw new Error(`${sku} requires a whole-number quantity of at least ${product.moq}`);
    if (!product.sizes.includes(size)) throw new Error(`${sku} has an invalid size`);
    if (seen.has(key)) throw new Error(`${sku} contains a duplicate size line`);
    seen.add(key);
    const lineTotal = product.unitPrice * quantity;
    if (!Number.isSafeInteger(lineTotal)) throw new Error("Order total is invalid");
    return { sku, name: sku, size, quantity, unitPrice: product.unitPrice, lineTotal, tax: 0, taxRate: 0 };
  });
  return lines;
}
