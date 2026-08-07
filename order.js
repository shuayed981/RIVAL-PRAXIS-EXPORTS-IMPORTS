(() => {
  "use strict";
  const cartLines = document.getElementById("cart-lines");
  const form = document.getElementById("customer-form");
  const message = document.getElementById("order-message");
  const submitButton = document.getElementById("submit-order");
  const downloadButton = document.getElementById("download-order");
  const paymentConfig = window.RIVAL_PAYMENT_CONFIG || {};
  let currentSubtotal = 0;

  const checkoutKey = () => `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const validLines = () => RIVAL_CART.read().map(item => ({ ...item, product: RIVAL_CART.product(item.sku) })).filter(item => item.product);

  function renderCart() {
    const lines = validLines(); currentSubtotal = 0;
    if (!lines.length) {
      cartLines.innerHTML = '<div class="empty-cart"><p>Your order cart is empty.</p><a class="btn" href="women.html">Browse Products</a></div>';
      submitButton.disabled = true; downloadButton.disabled = true;
      document.getElementById("order-subtotal").textContent = RIVAL_CART.money(0); document.getElementById("order-total").textContent = RIVAL_CART.money(0); return;
    }
    submitButton.disabled = false; downloadButton.disabled = false; cartLines.replaceChildren();
    lines.forEach((item, index) => {
      const lineTotal = item.product.price * item.quantity; currentSubtotal += lineTotal;
      const row = document.createElement("div"); row.className = "cart-line";
      const image = document.createElement("img"); image.src = item.product.image; image.alt = item.product.name;
      const details = document.createElement("div"); const heading = document.createElement("h3"); heading.textContent = item.product.name;
      const reference = document.createElement("p"); reference.textContent = item.product.sku; const category = document.createElement("p"); category.textContent = item.product.category;
      const selection = document.createElement("p"); selection.textContent = `Size: ${item.size} · ${RIVAL_CART.money(item.product.price)} each`;
      const moq = document.createElement("p"); moq.textContent = `MOQ: ${item.product.moq} units`; details.append(heading, reference, category, selection, moq);
      const quantityWrap = document.createElement("div"); quantityWrap.className = "cart-quantity"; const quantityLabel = document.createElement("label"); quantityLabel.className = "sr-only"; quantityLabel.htmlFor = `cart-qty-${index}`; quantityLabel.textContent = "Quantity";
      const quantityInput = document.createElement("input"); quantityInput.id = `cart-qty-${index}`; quantityInput.type = "number"; quantityInput.min = String(item.product.moq); quantityInput.step = "1"; quantityInput.value = String(item.quantity); quantityInput.setAttribute("aria-label", `Quantity for ${item.product.sku}`); quantityWrap.append(quantityLabel, quantityInput);
      const total = document.createElement("div"); total.className = "line-total"; total.textContent = RIVAL_CART.money(lineTotal);
      const remove = document.createElement("button"); remove.className = "remove-line"; remove.type = "button"; remove.setAttribute("aria-label", `Remove ${item.product.sku}`); remove.textContent = "×";
      row.append(image, details, quantityWrap, total, remove);
      quantityInput.addEventListener("change", () => { const cart = RIVAL_CART.read(); const target = cart.find(entry => entry.sku === item.sku && entry.size === item.size); if (!target) return; target.quantity = Math.max(item.product.moq, Math.floor(Number(quantityInput.value) || item.product.moq)); RIVAL_CART.write(cart); renderCart(); });
      remove.addEventListener("click", () => { const cart = RIVAL_CART.read(); const removeIndex = cart.findIndex(entry => entry.sku === item.sku && entry.size === item.size); if (removeIndex >= 0) cart.splice(removeIndex, 1); RIVAL_CART.write(cart); renderCart(); });
      cartLines.append(row);
    });
    document.getElementById("order-subtotal").textContent = RIVAL_CART.money(currentSubtotal); document.getElementById("order-total").textContent = RIVAL_CART.money(currentSubtotal);
  }

  function buildOrder() {
    const customer = Object.fromEntries(new FormData(form).entries());
    customer.termsAccepted = customer.legalConsent === "accepted"; customer.privacyAccepted = customer.legalConsent === "accepted"; delete customer.legalConsent;
    const items = validLines().map(item => ({ reference: item.product.sku, category: item.product.category, size: item.size, quantity: item.quantity, unitPrice: item.product.price, lineTotal: Number((item.product.price * item.quantity).toFixed(2)) }));
    return { createdAt: new Date().toISOString(), currency: "EUR", estimatedGoodsTotal: Number(currentSubtotal.toFixed(2)), customer, items };
  }

  function download(order) {
    const lines = order.items.map((item, index) => `${index + 1}. ${item.reference} | ${item.category} | Size: ${item.size} | Qty: ${item.quantity} | Unit: ${RIVAL_CART.money(item.unitPrice)} | Line: ${RIVAL_CART.money(item.lineTotal)}`);
    const content = [`WHOLESALE CHECKOUT SUMMARY`, `Created: ${new Date(order.createdAt).toLocaleDateString("en-GB")}`, "", `Company: ${order.customer.company}`, `Registration: ${order.customer.registrationNumber}`, `Contact: ${order.customer.contactName}`, `Email: ${order.customer.email}`, `Billing address: ${order.customer.address}, ${order.customer.city}, ${order.customer.postcode}, ${order.customer.country}`, "", ...lines, "", `GOODS TOTAL: ${RIVAL_CART.money(order.estimatedGoodsTotal)}`, "Tax is calculated automatically by the secure checkout service."].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "RIVAL-PRAXIS-checkout-summary.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault(); message.textContent = "";
    if (!form.reportValidity()) return;
    if (!validLines().length) { message.textContent = "Add at least one product before checkout."; return; }
    const order = buildOrder(); submitButton.disabled = true; submitButton.textContent = "Opening secure payment…";
    if (paymentConfig.enabled !== true || paymentConfig.commerceEnabled !== true || !/^https:\/\//.test(paymentConfig.apiBase || "")) {
      if (paymentConfig.mode === "hosted-link" && paymentConfig.hostedPage === "pay.html") {
        sessionStorage.setItem("rivalpraxisHostedGoodsTotal", String(order.estimatedGoodsTotal));
        window.location.assign(paymentConfig.hostedPage);
        return;
      }
      message.textContent = "Secure payment is not active yet.";
      submitButton.disabled = false;
      submitButton.textContent = "Continue to Secure Payment";
      return;
    }
    const requestKey = sessionStorage.getItem("rivalPraxisCheckoutKey") || checkoutKey(); sessionStorage.setItem("rivalPraxisCheckoutKey", requestKey);
    const payload = { requestKey, customer: order.customer, notes: order.customer.notes, items: order.items.map(item => ({ sku: item.reference, size: item.size, quantity: item.quantity })) };
    try {
      const response = await fetch(`${paymentConfig.apiBase}/order/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok || !data.redirectUrl || !data.token) throw new Error(data.message || "Checkout could not be started.");
      sessionStorage.setItem("rivalpraxisPaymentToken", data.token); sessionStorage.setItem("rivalpraxisOrderReference", data.orderReference); sessionStorage.removeItem("rivalPraxisCheckoutKey"); RIVAL_CART.write([]); window.location.assign(data.redirectUrl);
    } catch (error) {
      message.textContent = error.message === "Failed to fetch" ? "The secure checkout service is temporarily unavailable. Please try again shortly." : error.message; submitButton.disabled = false; submitButton.textContent = "Pay Securely";
    }
  });
  downloadButton.addEventListener("click", () => { if (!validLines().length) return; download(buildOrder()); message.textContent = "Your checkout summary has been downloaded."; });
  window.addEventListener("rival-cart-change", renderCart); renderCart();
})();
