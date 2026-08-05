(() => {
  "use strict";
  const config = window.RIVAL_PAYMENT_CONFIG || {};
  const api = config.apiBase || "";
  const token = new URLSearchParams(location.search).get("token") || "";
  const loading = document.getElementById("quote-loading");
  const content = document.getElementById("quote-content");
  const message = document.getElementById("quote-message");
  const consent = document.getElementById("quote-legal-consent");
  const acceptButton = document.getElementById("accept-quote");
  const money = (value, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value / 100);
  const fail = text => { loading.textContent = text; loading.classList.add("error"); };

  consent.addEventListener("change", () => { acceptButton.disabled = !consent.checked; });
  if (!token || !/^https:\/\//.test(api)) { fail("This quotation link is incomplete."); return; }

  fetch(`${api}/quote/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
    .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message); return data; })
    .then(quote => {
      loading.hidden = true;
      content.hidden = false;
      document.getElementById("quote-reference").textContent = quote.quoteReference;
      document.getElementById("quote-date").textContent = quote.quoteDate ? `Quote date ${new Date(quote.quoteDate).toLocaleDateString("en-GB")}` : "";
      document.getElementById("quote-expiry").textContent = quote.expiresAt ? `Valid until ${new Date(quote.expiresAt).toLocaleDateString("en-GB")}` : "";
      document.getElementById("quote-company").textContent = quote.customer.company;
      document.getElementById("quote-registration").textContent = quote.customer.registrationNumber ? `Company registration number: ${quote.customer.registrationNumber}` : "";
      document.getElementById("quote-contact").textContent = `${quote.customer.contactName} · ${quote.customer.email}`;
      const body = document.getElementById("quote-items");
      quote.items.forEach(item => {
        const row = document.createElement("tr");
        [item.sku, `${item.name}${item.size ? ` · ${item.size}` : ""}`, item.quantity, money(item.lineTotal, quote.currency)].forEach(value => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
        body.append(row);
      });
      ["subtotal", "tax", "shipping", "total"].forEach(key => { document.getElementById(`quote-${key}`).textContent = money(quote[key], quote.currency); });
      if (quote.status === "accepted" || quote.status === "paid") { acceptButton.disabled = true; acceptButton.textContent = "Quotation accepted"; consent.disabled = true; }
    })
    .catch(error => fail(error.message || "Quotation unavailable."));

  document.getElementById("print-quote").addEventListener("click", () => print());
  acceptButton.addEventListener("click", async event => {
    if (!consent.checked) return;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Accepting…";
    try {
      const response = await fetch(`${api}/quote/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, termsAccepted: true, privacyAccepted: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      event.currentTarget.textContent = "Quotation accepted";
      consent.disabled = true;
      message.textContent = "Accepted successfully. Continue to the secure payment page with the quotation reference sent to your email.";
    } catch (error) {
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = "Accept quotation";
      message.textContent = error.message;
    }
  });
})();
