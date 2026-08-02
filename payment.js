(() => {
  "use strict";
  const API_BASE = "https://payments.rivalpraxis.com/api";
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

  lookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
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
