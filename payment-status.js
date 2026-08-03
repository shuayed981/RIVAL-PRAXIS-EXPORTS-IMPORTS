(() => {
  "use strict";
  const config = window.RIVAL_PAYMENT_CONFIG || {};
  const API_BASE = config.apiBase || "";
  const card = document.getElementById("status-card");
  const title = document.getElementById("status-title");
  const message = document.getElementById("status-message");
  const icon = document.getElementById("status-icon");
  const details = document.getElementById("status-details");
  const invoicePanel = document.getElementById("invoice-panel");
  const invoiceButton = document.getElementById("download-invoice");
  const invoiceNote = document.getElementById("invoice-note");
  const token = new URLSearchParams(location.search).get("token") || sessionStorage.getItem("rivalpraxisPaymentToken");
  const money = (cents, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
  const showError = (text) => { card.className = "status-card error"; icon.textContent = "!"; title.textContent = "Payment not confirmed"; message.textContent = text; };
  if (config.enabled !== true || !/^https:\/\//.test(API_BASE)) { showError("Online payment verification is not active yet. Contact payment support if you received payment instructions."); return; }
  if (!token) { showError("No payment reference was found. Contact payment support before attempting another payment."); return; }
  fetch(`${API_BASE}/payment/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
    .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.message || "Verification failed."); return data; })
    .then((data) => {
      if (data.status !== "paid") throw new Error(data.message || "The payment was not completed.");
      card.className = "status-card success"; icon.textContent = "\u2713"; title.textContent = "Payment confirmed"; message.textContent = "Thank you. Your payment has been securely verified and linked to your quotation.";
      document.getElementById("status-reference").textContent = data.quoteReference; document.getElementById("status-transaction").textContent = data.transactionId; document.getElementById("status-amount").textContent = money(data.total, data.currency); details.hidden = false;
      if (data.invoice?.status === "issued" && data.invoice.downloadAvailable) {
        document.getElementById("invoice-number").textContent = data.invoice.invoiceNumber;
        document.getElementById("invoice-date").textContent = data.invoice.issueDate;
        document.getElementById("invoice-atcud").textContent = data.invoice.atcud;
        invoicePanel.hidden = false;
      } else if (["pending_provider", "failed"].includes(data.invoice?.status)) {
        invoicePanel.hidden = false; invoicePanel.classList.add("pending");
        invoicePanel.querySelector("dl").hidden = true; invoiceButton.hidden = true;
        invoiceNote.textContent = "Payment is confirmed. Your invoice is being finalized and will be sent by the invoicing team.";
      }
      sessionStorage.removeItem("rivalpraxisQuoteReference");
    })
    .catch((error) => showError(error.message === "Failed to fetch" ? "The verification service is temporarily unavailable. Do not pay again. Contact payment support with your quotation reference." : error.message));

  invoiceButton.addEventListener("click", async () => {
    invoiceButton.disabled = true; invoiceButton.textContent = "Preparing invoice…";
    try {
      const response = await fetch(`${API_BASE}/invoice/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "Invoice download failed."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${document.getElementById("invoice-number").textContent || "RIVAL-PRAXIS-invoice"}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); invoiceNote.textContent = "Invoice downloaded. Keep this PDF with your accounting records.";
    } catch (error) { invoiceNote.textContent = error.message; }
    finally { invoiceButton.disabled = false; invoiceButton.textContent = "Download PDF invoice"; }
  });
})();
