const clean = (value, max = 300) => String(value || "").trim().slice(0, max);
const now = () => new Date().toISOString();

async function record(env, key, recipients, subject, status, messageId = null, error = null) {
  if (!env.INVOICES_DB) return;
  await env.INVOICES_DB.prepare(`INSERT INTO email_events(idempotency_key,recipients_json,subject,provider_message_id,status,last_error,created_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(idempotency_key) DO UPDATE SET recipients_json=excluded.recipients_json,subject=excluded.subject,provider_message_id=excluded.provider_message_id,status=excluded.status,last_error=excluded.last_error`).bind(key, JSON.stringify(recipients), subject, messageId, status, error, now()).run();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

export async function sendEmail(env, { key, to, subject, heading, body, actionUrl, actionLabel, attachments = [] }) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map(value => clean(value, 150).toLowerCase()).filter(value => value.includes("@")))];
  if (!recipients.length) return { status: "skipped" };
  if (env.INVOICES_DB) {
    const existing = await env.INVOICES_DB.prepare("SELECT status FROM email_events WHERE idempotency_key=?1").bind(key).first();
    if (existing?.status === "sent") return existing;
  }
  if (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY) {
    await record(env, key, recipients, subject, "skipped", null, "Transactional email provider is not configured");
    return { status: "skipped" };
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f3eee8;font-family:Arial,sans-serif;color:#211a16"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="600" style="max-width:600px;background:#fff;border-top:5px solid #8c1d40"><tr><td style="padding:38px"><p style="margin:0 0 8px;color:#a78461;font-size:12px;font-weight:bold;letter-spacing:2px">RIVAL PRAXIS</p><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:34px">${escapeHtml(heading)}</h1><div style="font-size:15px;line-height:1.7">${body}</div>${actionUrl ? `<p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 22px;background:#211a16;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(actionLabel || "View details")}</a></p>` : ""}<p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #e4ddd6;color:#6e655e;font-size:12px">RIVAL PRAXIS UNIPESSOAL LDA · NIF/NIPC 519497074</p></td></tr></table></td></tr></table></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from: env.EMAIL_FROM || "RIVAL PRAXIS <orders@rivalpraxis.com>", to: recipients, subject, html, attachments }) });
    const result = await response.json();
    if (!response.ok) throw new Error(clean(result.message || `Email HTTP ${response.status}`));
    await record(env, key, recipients, subject, "sent", clean(result.id, 120));
    return { status: "sent", id: result.id };
  } catch (error) {
    await record(env, key, recipients, subject, "failed", null, clean(error.message));
    return { status: "failed" };
  }
}

export const merchantEmail = env => env.MERCHANT_ORDER_EMAIL || "rivalpraxisunipessoallda@gmail.com";
