(() => {
  "use strict";
  const config = window.RIVAL_PAYMENT_CONFIG || {};
  const api = config.apiBase || "";
  const SESSION_MS = 15 * 60 * 1000;
  const login = document.getElementById("admin-login");
  const dashboard = document.getElementById("dashboard");
  let token = "";
  let expiresAt = 0;

  const cents = value => Math.round(Number(value) * 100);
  const money = (value, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value / 100);

  function signOut(message = "") {
    token = "";
    expiresAt = 0;
    dashboard.hidden = true;
    login.hidden = false;
    document.getElementById("admin-token").value = "";
    document.getElementById("login-message").textContent = message;
  }

  async function call(path, body = {}) {
    if (expiresAt <= Date.now()) signOut("Your administrator session expired.");
    if (!token || !/^https:\/\//.test(api)) throw new Error("Administrator session is unavailable.");
    const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.status === 401) { signOut("Your administrator session expired or was rejected."); throw new Error("Administrator authorization required."); }
    if (!response.ok) throw new Error(data.message || "Request failed");
    expiresAt = Date.now() + SESSION_MS;
    return data;
  }

  function row(values) {
    const tr = document.createElement("tr");
    values.forEach((value, index) => {
      const td = document.createElement("td");
      if (index === 3) { const span = document.createElement("span"); span.className = "status-pill"; span.textContent = value; td.append(span); }
      else td.textContent = value ?? "—";
      tr.append(td);
    });
    return tr;
  }

  async function load() {
    const data = await call("/admin/list");
    document.getElementById("request-rows").replaceChildren(...data.requests.map(request => row([request.request_reference, request.customer_email, money(request.estimated_subtotal, request.currency), request.status, new Date(request.created_at).toLocaleDateString("en-GB")])));
    document.getElementById("order-rows").replaceChildren(...data.orders.map(order => row([order.order_reference, order.quote_reference, order.customer_email, order.status, order.tracking_reference])));
  }

  async function open() {
    try { await load(); login.hidden = true; dashboard.hidden = false; }
    catch (error) { document.getElementById("login-message").textContent = error.message; }
  }

  document.getElementById("login-form").addEventListener("submit", event => { event.preventDefault(); token = document.getElementById("admin-token").value.trim(); expiresAt = Date.now() + SESSION_MS; open(); });
  document.getElementById("refresh").addEventListener("click", () => load().catch(error => { document.getElementById("login-message").textContent = error.message; }));
  document.getElementById("logout").addEventListener("click", () => signOut("Signed out."));
  document.getElementById("quote-form").addEventListener("submit", async event => {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); const output = document.getElementById("quote-result");
    try {
      const data = await call("/admin/quote", { requestReference: fields.requestReference, subtotal: cents(fields.subtotal), tax: cents(fields.tax), shipping: cents(fields.shipping), total: cents(fields.total), expiresAt: `${fields.expiresAt}T23:59:59Z` });
      output.textContent = data.emailDelivery === "sent" ? `${data.quoteReference} created and emailed to the customer.` : `${data.quoteReference} created. Email delivery requires attention. Customer link: ${data.customerLink}`;
      event.currentTarget.reset(); await load();
    } catch (error) { output.textContent = error.message; }
  });
  document.getElementById("status-form").addEventListener("submit", async event => {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); const output = document.getElementById("status-result");
    try { const data = await call("/admin/order", fields); output.textContent = `${data.orderReference} updated to ${data.status}.`; await load(); }
    catch (error) { output.textContent = error.message; }
  });

  window.setInterval(() => { if (token && expiresAt <= Date.now()) signOut("Your administrator session expired."); }, 30000);
})();
