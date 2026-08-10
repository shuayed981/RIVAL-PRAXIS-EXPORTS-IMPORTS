import { sendEmail, merchantEmail } from "./email-service.js";
import { loadPayableOrder, markOrderPaid, markOrderPaymentPending } from "./order-payment-service.js";
import { createPaymentAttempt, ensurePaymentTransaction, updatePaymentAttempt } from "./payment-record-service.js";
import { getPaymentProvider } from "./payment-provider.js";
import { amountText, audit, base64Utf8, escapeHtml, normalize, sha256Hex } from "./worker-runtime.js";

const SESSION_TTL_SECONDS = 86400 * 7;

function accountingSummary(quote) {
  const lines = (quote.items || []).slice(0, 100).map(item => `<li>${escapeHtml(item.sku || "Item")} — ${escapeHtml(item.name || "Wholesale goods")} — Qty ${Number(item.quantity) || 1} — Net ${escapeHtml(amountText(item.amount ?? item.lineTotal, quote.currency))} — VAT ${escapeHtml(amountText(item.tax, quote.currency))}</li>`).join("");
  const billing = quote.billing || {};
  return `<p><b>Customer:</b> ${escapeHtml(quote.company)}<br><b>Contact:</b> ${escapeHtml([quote.firstName, quote.lastName].filter(Boolean).join(" "))}<br><b>Email:</b> ${escapeHtml(quote.email)}<br><b>Tax number:</b> ${escapeHtml(quote.tin)}<br><b>Billing address:</b> ${escapeHtml([billing.street1, billing.street2, billing.zipCode, billing.city, billing.country].filter(Boolean).join(", "))}</p><p><b>Order lines:</b></p><ul>${lines}</ul><p><b>Subtotal:</b> ${escapeHtml(amountText(quote.subtotal, quote.currency))}<br><b>VAT:</b> ${escapeHtml(amountText(quote.tax, quote.currency))}<br><b>Total paid:</b> ${escapeHtml(amountText(quote.total, quote.currency))}</p>`;
}
export async function createPaymentSession(env, { quoteReference, email }) {
  const provider = getPaymentProvider(env);
  provider.assertAutomaticConfiguration(env);
  const quote = await loadPayableOrder(env, quoteReference, email);
  if (!quote) throw new Error("PAYABLE_ORDER_NOT_FOUND");
  if (quote.paymentStatus === "paid") throw new Error("ORDER_ALREADY_PAID");
  const sessionNow = new Date().toISOString();
  await env.INVOICES_DB.prepare("UPDATE payment_sessions SET status='expired',updated_at=?1 WHERE quote_reference=?2 AND status='pending' AND expires_at<=?1").bind(sessionNow, quote.quoteReference).run();
  const existingSession = await env.INVOICES_DB.prepare(`SELECT payment_token,redirect_url FROM payment_sessions
    WHERE quote_reference=?1 AND status='pending' AND expires_at>?2 ORDER BY created_at DESC LIMIT 1`).bind(quote.quoteReference, sessionNow).first();
  if (existingSession?.redirect_url) {
    await createPaymentAttempt(env, { provider: provider.id, tokenHash: await sha256Hex(existingSession.payment_token), quoteReference: quote.quoteReference, total: quote.total, currency: quote.currency || "EUR" });
    return { token: existingSession.payment_token, redirectUrl: existingSession.redirect_url };
  }
  if (quote.expiresAt && Date.parse(quote.expiresAt) < Date.now()) throw new Error("ORDER_EXPIRED");
  const site = env.SITE_ORIGIN || "https://rivalpraxis.com";
  const apiOrigin = env.API_ORIGIN || "https://payments.rivalpraxis.com";
  const initialized = await provider.initializePayment(env, {
    quote,
    urls: {
      returnUrlOk: `${site}/payment-status.html`,
      returnUrlError: `${site}/payment-status.html?result=error`,
      notificationUrl: `${apiOrigin}/api/payment/notification`,
    },
  });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const tokenHash = await sha256Hex(initialized.token);
  try {
    await env.INVOICES_DB.prepare(`INSERT INTO payment_sessions(token_hash,payment_token,quote_reference,total,currency,redirect_url,status,created_at,expires_at,updated_at)
      VALUES(?1,?2,?3,?4,?5,?6,'pending',?7,?8,?7)`).bind(tokenHash, initialized.token, quote.quoteReference, quote.total, quote.currency || "EUR", initialized.redirectUrl, createdAt, expiresAt).run();
  } catch (error) {
    const winner = await env.INVOICES_DB.prepare("SELECT payment_token,redirect_url FROM payment_sessions WHERE quote_reference=?1 AND status='pending' AND expires_at>?2 LIMIT 1").bind(quote.quoteReference, createdAt).first();
    if (winner?.redirect_url) return { token: winner.payment_token, redirectUrl: winner.redirect_url };
    throw error;
  }
  await createPaymentAttempt(env, { provider: provider.id, tokenHash, quoteReference: quote.quoteReference, total: quote.total, currency: quote.currency || "EUR" });
  await markOrderPaymentPending(env, quote.quoteReference);
  await audit(env, quote.quoteReference, "payment_initialized", { provider: provider.id, expiresAt });
  return { token: initialized.token, redirectUrl: initialized.redirectUrl };
}

export async function verifyPaymentToken(env, token) {
  const provider = getPaymentProvider(env);
  provider.assertAutomaticConfiguration(env);
  const normalizedToken = normalize(token, 80); const tokenHash = await sha256Hex(normalizedToken);
  const row = await env.INVOICES_DB.prepare(`SELECT quote_reference,total,currency,redirect_url,status,expires_at
    FROM payment_sessions WHERE token_hash=?1`).bind(tokenHash).first();
  if (!row || row.expires_at <= new Date().toISOString()) return null;
  const session = { quoteReference: row.quote_reference, total: row.total, currency: row.currency, redirectUrl: row.redirect_url };
  const verification = await provider.verifyPayment(env, normalizedToken, session.total);
  await updatePaymentAttempt(env, { tokenHash, ...verification });
  if (!verification.paid && ["failed", "canceled"].includes(verification.outcome) && row.status === "pending") {
    await env.INVOICES_DB.prepare("UPDATE payment_sessions SET status='failed',updated_at=?1 WHERE token_hash=?2 AND status='pending'").bind(new Date().toISOString(), tokenHash).run();
  }
  if (verification.paid) {
    const orderIdentity = await env.INVOICES_DB.prepare("SELECT customer_email FROM orders WHERE quote_reference=?1").bind(session.quoteReference).first();
    const quote = await loadPayableOrder(env, session.quoteReference, orderIdentity?.customer_email);
    if (row.status !== "paid") {
      await env.INVOICES_DB.prepare(`UPDATE payment_sessions SET status='paid',transaction_id=?1,updated_at=?2
        WHERE token_hash=?3 AND status='pending'`).bind(verification.transactionId, new Date().toISOString(), tokenHash).run();
      await audit(env, session.quoteReference, "payment_confirmed", { provider: provider.id, transactionId: verification.transactionId, total: session.total, currency: session.currency, resultCode: verification.resultCode });
    }
    if (quote) {
      const order = await markOrderPaid(env, session.quoteReference, verification.transactionId);
      if (order) {
        const paymentRecord = await ensurePaymentTransaction(env, { order, quote, verification });
        await Promise.all([
          sendEmail(env, { key: `payment-customer-${verification.transactionId}`, to: order.customer_email, subject: `Payment confirmed - ${order.order_reference}`, heading: "Payment confirmed", body: `<p>We securely confirmed payment of <b>${escapeHtml(amountText(session.total, session.currency))}</b> for order <b>${escapeHtml(order.order_reference)}</b>.</p><p>Payment record: <b>${escapeHtml(paymentRecord.record_reference)}</b><br>Transaction: <b>${escapeHtml(verification.transactionId)}</b></p><p>Your professional payment confirmation is attached.</p>`, attachments: [{ filename: `${paymentRecord.record_reference}.html`, content: base64Utf8(paymentRecord.confirmation_html) }] }),
          sendEmail(env, { key: `payment-merchant-${verification.transactionId}`, to: merchantEmail(env), subject: `Payment confirmed - ${order.order_reference}`, heading: "Verified payment", body: `<p>Payment for order <b>${escapeHtml(order.order_reference)}</b> was verified and recorded as paid.</p><p>Payment record: <b>${escapeHtml(paymentRecord.record_reference)}</b><br>Transaction: <b>${escapeHtml(verification.transactionId)}</b></p>${accountingSummary(quote)}` }),
        ]);
      }
    }
  }
  return { ...verification, session };
}

export async function reconcilePendingPaymentSessions(env, { limit = 25 } = {}) {
  const now = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const pending = await env.INVOICES_DB.prepare(`SELECT payment_token,quote_reference FROM payment_sessions
    WHERE status='pending' AND expires_at>?1 ORDER BY created_at ASC LIMIT ?2`).bind(now, safeLimit).all();
  const results = [];
  for (const row of pending.results || []) {
    try {
      const verification = await verifyPaymentToken(env, row.payment_token);
      if (!verification) continue;
      const result = {
        quoteReference: row.quote_reference,
        outcome: verification.outcome,
        resultCode: verification.resultCode,
        transactionStatus: verification.transactionStatus,
      };
      console.log(JSON.stringify({ event: "payment_reconciliation", ...result }));
      results.push(result);
    } catch (error) {
      console.error(JSON.stringify({
        event: "payment_reconciliation_error",
        quoteReference: row.quote_reference,
        message: String(error?.message || "unknown"),
      }));
    }
  }
  return results;
}

export async function retryPaymentSession(env, token) {
  const provider = getPaymentProvider(env); provider.assertAutomaticConfiguration(env);
  const tokenHash = await sha256Hex(normalize(token, 80));
  const attempt = await env.INVOICES_DB.prepare("SELECT * FROM payment_attempts WHERE token_hash=?1").bind(tokenHash).first();
  if (!attempt) throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
  if (!["failed", "canceled"].includes(attempt.status)) throw new Error("PAYMENT_RETRY_NOT_ALLOWED");
  const order = await env.INVOICES_DB.prepare("SELECT customer_email FROM orders WHERE order_reference=?1").bind(attempt.order_reference).first();
  if (!order?.customer_email) throw new Error("PAYABLE_ORDER_NOT_FOUND");
  return await createPaymentSession(env, { quoteReference: attempt.quote_reference, email: order.customer_email });
}
