(() => {
  "use strict";
  const config = window.RIVAL_PAYMENT_CONFIG || {};
  const API_BASE = config.apiBase || "";
  const PAYMENT_SERVICE_ENABLED = config.enabled === true && /^https:\/\//.test(API_BASE);
  const lookupForm = document.getElementById("quote-lookup-form");
  const lookupMessage = document.getElementById("lookup-message");
  const summary = document.getElementById("quote-summary");
  const consent = document.getElementById("accept-terms");
  const payButton = document.getElementById("start-payment");
  const paymentMessage = document.getElementById("payment-message");
  let activeQuote = null;

  const money = (cents, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
  const setBusy = (button, busy, label) => { button.disabled = busy; button.textContent = busy ? label : button.dataset.label; };
  const clean = (value) => value.trim();

  function addDetail(container, label, value) {
    const item = document.createElement("div"), heading = document.createElement("strong"), text = document.createElement("span");
    heading.textContent = label; text.textContent = value || "Not supplied"; item.append(heading, text); container.append(item);
  }

  function showDemoQuote() {
    if (new URLSearchParams(location.search).get("demo") !== "1") return false;
    let order;
    try { order = JSON.parse(sessionStorage.getItem("rivalPraxisDemoQuote")); } catch { order = null; }
    if (!order?.customer || !Array.isArray(order.items) || !order.items.length) {
      lookupMessage.textContent = "No trial order was found. Build an order first, then select Try Demo Payment Page.";
      return true;
    }
    const cents = Math.round(Number(order.estimatedGoodsTotal) * 100);
    document.querySelector(".payment-intro h1").textContent = "Payment Trial Preview";
    document.querySelector(".payment-intro > p:last-of-type").textContent = "Review the company, delivery, products and estimated total exactly as they will appear before an activated hosted payment.";
    lookupForm.hidden = true;
    document.querySelector(".step-label").hidden = true;
    document.getElementById("summary-reference").textContent = order.reference;
    document.getElementById("summary-company").textContent = order.customer.company;
    document.getElementById("summary-subtotal").textContent = money(cents, order.currency);
    document.getElementById("summary-tax").textContent = "Calculated on confirmed quote";
    document.getElementById("summary-shipping").textContent = "Calculated on confirmed quote";
    document.getElementById("summary-total").textContent = money(cents, order.currency);
    const notice = document.getElementById("demo-payment-notice"), details = document.getElementById("demo-order-details");
    notice.hidden = false; details.hidden = false;
    const title = document.createElement("h3"); title.textContent = "Company and delivery details";
    const grid = document.createElement("div"); grid.className = "demo-company-grid";
    addDetail(grid, "Company", order.customer.company); addDetail(grid, "Contact", order.customer.contactName);
    addDetail(grid, "Email", order.customer.email); addDetail(grid, "Telephone", order.customer.phone);
    addDetail(grid, "VAT / tax number", order.customer.taxNumber); addDetail(grid, "Country", order.customer.country);
    addDetail(grid, "Delivery address", `${order.customer.address}, ${order.customer.city}, ${order.customer.postcode}`);
    addDetail(grid, "Order notes", order.customer.notes);
    const itemsTitle = document.createElement("h3"); itemsTitle.textContent = "Products";
    const table = document.createElement("table"); table.className = "demo-items";
    const head = table.createTHead().insertRow(); ["Reference", "Size", "Quantity", "Line total"].forEach(label => { const th = document.createElement("th"); th.textContent = label; head.append(th); });
    const body = table.createTBody(); order.items.forEach(item => { const row = body.insertRow(); [item.reference, item.size, String(item.quantity), money(Math.round(Number(item.lineTotal) * 100), order.currency)].forEach(value => { const cell = row.insertCell(); cell.textContent = value; }); });
    details.replaceChildren(title, grid, itemsTitle, table);
    consent.closest("label").hidden = true; payButton.textContent = "Trial Complete — No Payment Made"; payButton.disabled = true;
    paymentMessage.textContent = "This is a safe preview. REDUNIQ and Getnet were not contacted.";
    summary.hidden = false; return true;
  }

  showDemoQuote();

  lookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!PAYMENT_SERVICE_ENABLED) {
      lookupMessage.textContent = "REDUNIQ / Getnet hosted payment activation is in progress. Contact payment support to pay an approved quotation.";
      return;
    }
    const button = lookupForm.querySelector("button[type=submit]");
    button.dataset.label ||= button.textContent;
    lookupMessage.textContent = "";
    summary.hidden = true;
    activeQuote = null;
    const quoteReference = clean(lookupForm.quoteReference.value).toUpperCase();
    const email = clean(lookupForm.email.value).toLowerCase();
    if (!quoteReference || !email || !lookupForm.email.checkValidity()) {
      lookupMessage.textContent = "Enter the quotation reference and a valid billing email.";
      return;
    }
    setBusy(button, true, "Checking quotation...");
    try {
      const response = await fetch(`${API_BASE}/quote/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteReference, email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Quotation could not be verified.");
      activeQuote = { quoteReference, email };
      document.getElementById("summary-reference").textContent = data.quoteReference;
      document.getElementById("summary-company").textContent = data.company;
      document.getElementById("summary-subtotal").textContent = money(data.subtotal, data.currency);
      document.getElementById("summary-tax").textContent = money(data.tax, data.currency);
      document.getElementById("summary-shipping").textContent = money(data.shipping, data.currency);
      document.getElementById("summary-total").textContent = money(data.total, data.currency);
      consent.checked = false;
      payButton.disabled = true;
      summary.hidden = false;
      summary.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      lookupMessage.textContent = error.message === "Failed to fetch" ? "Secure payment activation is being completed. Please contact us to pay this quotation." : error.message;
    } finally {
      setBusy(button, false, "");
    }
  });

  consent?.addEventListener("change", () => { payButton.disabled = !consent.checked || !activeQuote; });
  payButton?.addEventListener("click", async () => {
    if (!activeQuote || !consent.checked) return;
    payButton.dataset.label ||= payButton.textContent;
    paymentMessage.textContent = "";
    setBusy(payButton, true, "Opening secure payment...");
    try {
      const response = await fetch(`${API_BASE}/payment/init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(activeQuote) });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl || !data.token) throw new Error(data.message || "Payment could not be initialized.");
      sessionStorage.setItem("rivalpraxisPaymentToken", data.token);
      sessionStorage.setItem("rivalpraxisQuoteReference", activeQuote.quoteReference);
      window.location.assign(data.redirectUrl);
    } catch (error) {
      paymentMessage.textContent = error.message === "Failed to fetch" ? "The secure payment service is not active yet. Please contact payment support." : error.message;
      setBusy(payButton, false, "");
      payButton.disabled = !consent.checked;
    }
  });
})();
