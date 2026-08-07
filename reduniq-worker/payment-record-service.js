import { audit, escapeHtml, normalize } from "./worker-runtime.js";

const now = () => new Date().toISOString();
const ref = prefix => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;

function confirmationDocument({ recordReference, order, quote, transactionId, verifiedAt, provider }) {
  const amount = new Intl.NumberFormat("en-IE", { style: "currency", currency: quote.currency || "EUR" }).format(Number(quote.total || 0) / 100);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment confirmation ${escapeHtml(recordReference)}</title><style>body{margin:0;background:#f2ede6;color:#241b17;font:16px/1.6 Arial,sans-serif}.sheet{max-width:760px;margin:40px auto;background:#fff;padding:48px;box-shadow:0 18px 50px #0002}.brand{color:#7d1d2f;font:700 28px Georgia,serif}.paid{display:inline-block;margin:28px 0 18px;padding:8px 14px;background:#31563a;color:#fff;font-weight:700;letter-spacing:.12em}h1{margin:0;font:700 46px/1.05 Georgia,serif}dl{margin:30px 0;border-top:1px solid #ddd}div.row{display:flex;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:1px solid #eee}dt{color:#6b625d}dd{margin:0;font-weight:700;text-align:right}.note{margin-top:30px;padding:18px;background:#f7f3ee;font-size:13px}@media(max-width:600px){.sheet{margin:0;padding:28px 20px;box-shadow:none}h1{font-size:36px}div.row{display:block}dd{text-align:left}}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}</style></head><body><main class="sheet"><div class="brand">RIVAL PRAXIS</div><span class="paid">PAID</span><h1>Payment confirmation</h1><p>This document confirms that the ${escapeHtml(provider.toUpperCase())} transaction below was securely verified and the order was marked as paid.</p><dl><div class="row"><dt>Payment record</dt><dd>${escapeHtml(recordReference)}</dd></div><div class="row"><dt>Order</dt><dd>${escapeHtml(order.order_reference)}</dd></div><div class="row"><dt>Customer</dt><dd>${escapeHtml(quote.company || order.customer_email)}</dd></div><div class="row"><dt>Transaction</dt><dd>${escapeHtml(transactionId)}</dd></div><div class="row"><dt>Amount</dt><dd>${escapeHtml(amount)}</dd></div><div class="row"><dt>Verified</dt><dd>${escapeHtml(verifiedAt)}</dd></div></dl><div class="note"><strong>Merchant:</strong> RIVAL PRAXIS UNIPESSOAL LDA · NIF 519497074<br>Rua de Manhica, 446 R/C, 1800-245 Lisboa, Portugal<br>This is a payment-status record. It is not an invoice and contains no shipping or delivery information.</div></main></body></html>`;
}
export async function createPaymentAttempt(env, input) {
  const existing = await env.INVOICES_DB.prepare("SELECT * FROM payment_attempts WHERE token_hash=?1").bind(input.tokenHash).first();
  if (existing) return existing;
  const order = await env.INVOICES_DB.prepare("SELECT order_reference FROM orders WHERE quote_reference=?1").bind(input.quoteReference).first();
  if (!order) throw new Error("Order was not found for payment attempt");
  const id = crypto.randomUUID(); const attemptReference = ref("RP-ATT"); const at = now();
  await env.INVOICES_DB.prepare(`INSERT OR IGNORE INTO payment_attempts(id,attempt_reference,token_hash,order_reference,quote_reference,total,currency,status,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,'initialized',?8,?8)`).bind(id, attemptReference, input.tokenHash, order.order_reference, input.quoteReference, input.total, input.currency || "EUR", at).run();
  await audit(env, order.order_reference, "payment_attempt_initialized", { attemptReference, provider: input.provider });
  return await env.INVOICES_DB.prepare("SELECT * FROM payment_attempts WHERE token_hash=?1").bind(input.tokenHash).first();
}

export async function updatePaymentAttempt(env, input) {
  const at = now(); const final = ["paid", "failed", "canceled"].includes(input.outcome) ? at : null;
  await env.INVOICES_DB.prepare(`UPDATE payment_attempts SET status=?1,result_code=?2,transaction_status=?3,provider_message=?4,transaction_id=?5,
    verification_count=verification_count+1,updated_at=?6,finalized_at=COALESCE(finalized_at,?7) WHERE token_hash=?8`).bind(input.outcome, normalize(input.resultCode, 30), Number.isFinite(input.transactionStatus) ? input.transactionStatus : null, normalize(input.providerMessage, 255), normalize(input.transactionId, 80), at, final, input.tokenHash).run();
  const attempt = await env.INVOICES_DB.prepare("SELECT * FROM payment_attempts WHERE token_hash=?1").bind(input.tokenHash).first();
  if (attempt) await audit(env, attempt.order_reference, `payment_attempt_${input.outcome}`, { attemptReference: attempt.attempt_reference, resultCode: normalize(input.resultCode, 30), transactionStatus: Number.isFinite(input.transactionStatus) ? input.transactionStatus : null });
  return attempt;
}

export async function ensurePaymentTransaction(env, { order, quote, verification }) {
  const transactionId = verification.transactionId;
  const existing = await env.INVOICES_DB.prepare("SELECT * FROM payment_transactions WHERE provider_transaction_id=?1").bind(transactionId).first();
  if (existing) return existing;
  const id = crypto.randomUUID(); const recordReference = ref("RP-PAY"); const verifiedAt = now();
  const provider = normalize(verification.provider, 30).toLowerCase() || "unknown";
  const confirmationHtml = confirmationDocument({ recordReference, order, quote, transactionId, verifiedAt, provider });
  const providerRecord = { resultCode: verification.resultCode, transactionStatus: verification.transactionStatus, paymentAmount: verification.gatewayAmount };
  await env.INVOICES_DB.prepare(`INSERT OR IGNORE INTO payment_transactions(id,record_reference,order_reference,provider,provider_transaction_id,total,currency,status,provider_record_json,confirmation_html,verified_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,'paid',?8,?9,?10)`).bind(id, recordReference, order.order_reference, provider, transactionId, quote.total, quote.currency, JSON.stringify(providerRecord), confirmationHtml, verifiedAt).run();
  await audit(env, order.id, "payment_recorded", { recordReference, transactionId, provider });
  return await env.INVOICES_DB.prepare("SELECT * FROM payment_transactions WHERE provider_transaction_id=?1").bind(transactionId).first();
}
