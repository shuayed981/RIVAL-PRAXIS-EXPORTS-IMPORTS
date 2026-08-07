(() => {
  "use strict";
  const config = window.RIVAL_PAYMENT_CONFIG || {};
  const API_BASE = config.apiBase || "";
  const card = document.getElementById("status-card");
  const title = document.getElementById("status-title");
  const message = document.getElementById("status-message");
  const icon = document.getElementById("status-icon");
  const details = document.getElementById("status-details");
  const paymentProof = document.getElementById("payment-proof");
  const retryPayment = document.getElementById("retry-payment");
  const downloadButton = document.getElementById("download-payment-confirmation");
  const token = new URLSearchParams(location.search).get("token") || sessionStorage.getItem("rivalpraxisPaymentToken");
  const money = (cents, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
  let confirmationHtml = "";
  let confirmationReference = "payment-confirmation";
  let retryOutcome = "";
  const showOutcome = data => {
    card.className = "status-card error"; icon.textContent = "!"; message.textContent = data.message;
    const titles = { failed: "Payment failed", canceled: "Payment canceled", unconfirmed: "Payment not yet confirmed" };
    title.textContent = titles[data.status] || "Payment not confirmed";
    retryOutcome = data.status || "unconfirmed";
    retryPayment.hidden = false;
    if (data.status === "unconfirmed") { retryPayment.textContent = "Check Payment Again"; retryPayment.href = location.href; }
    else { retryPayment.textContent = "Try Payment Again"; retryPayment.href = "#retry"; }
  };
  const showError = text => showOutcome({ status: "unconfirmed", message: text });

  if (config.enabled !== true || !/^https:\/\//.test(API_BASE)) { showError("Online payment verification is not active yet. Contact payment support if you received payment instructions."); return; }
  if (!token) { showError("No payment reference was found. Contact payment support before attempting another payment."); return; }

  fetch(`${API_BASE}/payment/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
    .then(async response => { const data = await response.json(); if (response.status >= 500) throw new Error(data.message || "Verification failed."); return data; })
    .then(data => {
      if (data.status !== "paid") { showOutcome(data); return; }
      card.className = "status-card success";
      icon.textContent = "\u2713";
      title.textContent = "Payment confirmed";
      message.textContent = "Thank you. Your REDUNIQ payment was verified securely and your order was marked as paid.";
      document.getElementById("status-reference").textContent = data.orderReference;
      document.getElementById("status-payment-record").textContent = data.paymentRecordReference;
      document.getElementById("status-transaction").textContent = data.transactionId;
      document.getElementById("status-amount").textContent = money(data.total, data.currency);
      details.hidden = false;
      paymentProof.hidden = false;
      confirmationHtml = data.confirmationHtml || "";
      confirmationReference = data.paymentRecordReference || "payment-confirmation";
      downloadButton.disabled = !confirmationHtml;
      sessionStorage.removeItem("rivalpraxisOrderReference");
    })
    .catch(error => showError(error.message === "Failed to fetch" ? "The verification service is temporarily unavailable. Do not pay again. Contact payment support with your quotation reference." : error.message));

  document.getElementById("print-payment-proof").addEventListener("click", () => window.print());
  downloadButton.addEventListener("click", () => {
    if (!confirmationHtml) return;
    const blob = new Blob([confirmationHtml], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${confirmationReference}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  retryPayment.addEventListener("click", async event => {
    if (retryOutcome === "unconfirmed") return;
    event.preventDefault(); retryPayment.setAttribute("aria-disabled", "true"); retryPayment.textContent = "Opening a new secure payment...";
    try {
      const response = await fetch(`${API_BASE}/payment/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl || !data.token) throw new Error(data.message || "A new payment attempt could not be started.");
      sessionStorage.setItem("rivalpraxisPaymentToken", data.token); window.location.assign(data.redirectUrl);
    } catch (error) {
      message.textContent = error.message; retryPayment.removeAttribute("aria-disabled"); retryPayment.textContent = "Try Payment Again";
    }
  });
})();
