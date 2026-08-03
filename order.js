(() => {
  "use strict";
  const cartLines = document.getElementById("cart-lines");
  const form = document.getElementById("customer-form");
  const message = document.getElementById("order-message");
  const submitButton = document.getElementById("submit-order");
  const downloadButton = document.getElementById("download-order");
  const recipient = "rivalpraxisunipessoallda@gmail.com";
  const paymentConfig = window.RIVAL_PAYMENT_CONFIG || {};
  let currentSubtotal = 0;

  const safe = value => String(value || "").trim();
  const requestReference = () => {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(-6);
    return `RP-RQ-${date}-${random}`;
  };

  function validLines() {
    return RIVAL_CART.read().map(item => ({ ...item, product: RIVAL_CART.product(item.sku) })).filter(item => item.product);
  }

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
      row.innerHTML = `<img src="${item.product.image}" alt="${item.product.sku}"><div><h3>${item.product.sku}</h3><p>${item.product.category}</p><p>Size: ${item.size} &middot; ${RIVAL_CART.money(item.product.price)} each</p><p>MOQ: ${item.product.moq} units</p></div><div class="cart-quantity"><label class="sr-only" for="cart-qty-${index}">Quantity</label><input id="cart-qty-${index}" type="number" min="${item.product.moq}" step="1" value="${item.quantity}" aria-label="Quantity for ${item.product.sku}"></div><div class="line-total">${RIVAL_CART.money(lineTotal)}</div><button class="remove-line" type="button" aria-label="Remove ${item.product.sku}">&times;</button>`;
      const qty = row.querySelector("input"); qty.addEventListener("change", () => {
        const cart = RIVAL_CART.read(); const target = cart.find(entry => entry.sku === item.sku && entry.size === item.size);
        if (!target) return; target.quantity = Math.max(item.product.moq, Math.floor(Number(qty.value) || item.product.moq)); RIVAL_CART.write(cart); renderCart();
      });
      row.querySelector("button").addEventListener("click", () => { const cart = RIVAL_CART.read(); cart.splice(cart.findIndex(entry => entry.sku === item.sku && entry.size === item.size), 1); RIVAL_CART.write(cart); renderCart(); });
      cartLines.append(row);
    });
    document.getElementById("order-subtotal").textContent = RIVAL_CART.money(currentSubtotal); document.getElementById("order-total").textContent = RIVAL_CART.money(currentSubtotal);
  }

  function buildOrder(reference) {
    const customer = Object.fromEntries(new FormData(form).entries());
    const items = validLines().map(item => ({ reference: item.product.sku, category: item.product.category, size: item.size, quantity: item.quantity, unitPrice: item.product.price, lineTotal: Number((item.product.price * item.quantity).toFixed(2)) }));
    return { reference, createdAt: new Date().toISOString(), currency: "EUR", estimatedGoodsTotal: Number(currentSubtotal.toFixed(2)), customer, items };
  }

  function orderText(order) {
    const lines = order.items.map((item, i) => `${i + 1}. ${item.reference} | ${item.category} | Size: ${item.size} | Qty: ${item.quantity} | Unit: ${RIVAL_CART.money(item.unitPrice)} | Line: ${RIVAL_CART.money(item.lineTotal)}`);
    return [`WHOLESALE ORDER REQUEST ${order.reference}`, `Created: ${new Date(order.createdAt).toLocaleString("en-GB")}`, "", "CUSTOMER", `Company: ${order.customer.company}`, `Contact: ${order.customer.contactName}`, `Email: ${order.customer.email}`, `Telephone: ${order.customer.phone}`, `VAT / tax number: ${order.customer.taxNumber || "Not supplied"}`, `Delivery: ${order.customer.address}, ${order.customer.city}, ${order.customer.postcode}, ${order.customer.country}`, "", "PRODUCTS", ...lines, "", `ESTIMATED GOODS TOTAL: ${RIVAL_CART.money(order.estimatedGoodsTotal)}`, "VAT, taxes, shipping, stock availability and the final payable total remain subject to a confirmed written quotation.", "", `Notes: ${order.customer.notes || "None"}`].join("\n");
  }

  function download(order) {
    const blob = new Blob([orderText(order)], { type: "text/plain;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${order.reference}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  form.addEventListener("submit", event => {
    event.preventDefault(); message.textContent = "";
    if (!form.reportValidity()) return;
    if (!validLines().length) { message.textContent = "Add at least one product before requesting a quotation."; return; }
    const order = buildOrder(requestReference()); submitButton.disabled = true; submitButton.textContent = "Sending request…";
    if (paymentConfig.commerceEnabled === true && /^https:\/\//.test(paymentConfig.apiBase || "")) {
      const payload = { customer: order.customer, notes: order.customer.notes, items: order.items.map(item => ({ sku: item.reference, name: item.category, size: item.size, quantity: item.quantity, unitPrice: Math.round(item.unitPrice * 100), lineTotal: Math.round(item.lineTotal * 100) })) };
      fetch(`${paymentConfig.apiBase}/quote/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || "Request failed."); return data; })
        .then(data => { order.reference = data.requestReference; sessionStorage.setItem("rivalPraxisLastOrder", JSON.stringify(order)); download(order); RIVAL_CART.write([]); renderCart(); message.textContent = `Request ${data.requestReference} was submitted. A confirmation email is on its way.`; })
        .catch(error => { message.textContent = error.message === "Failed to fetch" ? "The secure request service is temporarily unavailable. Please try again shortly." : error.message; })
        .finally(() => { submitButton.disabled = false; submitButton.textContent = "Request Confirmed Quote"; });
    } else {
      sessionStorage.setItem("rivalPraxisLastOrder", JSON.stringify(order)); download(order);
      const subject = `Wholesale Order Request - ${order.reference} - ${safe(order.customer.company)}`;
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderText(order))}`;
      message.textContent = `Order ${order.reference} is ready. A copy was downloaded and your email application is opening so you can send it.`;
      submitButton.disabled = false; submitButton.textContent = "Request Confirmed Quote";
    }
  });
  downloadButton.addEventListener("click", () => { if (!validLines().length) return; download(buildOrder(requestReference())); message.textContent = "Your order copy has been downloaded."; });
  window.addEventListener("rival-cart-change", renderCart); renderCart();
})();
