const enc = new TextEncoder();
const now = () => new Date().toISOString();
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const jsonText = value => JSON.stringify(value ?? null);
const cents = value => Number.isSafeInteger(Number(value)) ? Number(value) : 0;

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function seller(env) {
  return {
    legalName: env.INVOICE_SELLER_NAME || "RIVAL PRAXIS UNIPESSOAL LDA",
    tradingName: "RIVAL PRAXIS",
    taxNumber: env.INVOICE_SELLER_TIN || "519497074",
    address: env.INVOICE_SELLER_ADDRESS || "Rua de Manhica, 1800-245 Lisboa, Portugal",
    email: env.INVOICE_SELLER_EMAIL || "rivalpraxisunipessoallda@gmail.com"
  };
}

function buyerOf(quote) {
  return {
    company: clean(quote.company, 120), taxNumber: clean(quote.tin, 30), email: clean(quote.email, 150), phone: clean(quote.phone, 30),
    contactName: clean([quote.firstName, quote.lastName].filter(Boolean).join(" "), 120),
    billing: {
      street1: clean(quote.billing?.street1, 120), street2: clean(quote.billing?.street2, 120), city: clean(quote.billing?.city, 60),
      state: clean(quote.billing?.state, 60), zipCode: clean(quote.billing?.zipCode, 20), country: clean(quote.billing?.country || "PT", 2).toUpperCase()
    }
  };
}

function itemsOf(quote) {
  return (quote.items || []).slice(0, 100).map((item, index) => ({
    line: index + 1, sku: clean(item.sku || item.reference, 50), description: clean(item.name || "Wholesale goods", 180),
    quantity: Math.max(1, Number(item.quantity) || 1), netAmount: cents(item.amount), taxAmount: cents(item.tax), taxRate: Number(item.taxRate) || null
  }));
}

async function allocateRequestNumber(env) {
  if (!env.INVOICES_DB) throw new Error("Invoice database is not configured");
  const series = clean(env.INVOICE_REQUEST_SERIES || "RP-PAY", 20).toUpperCase();
  const year = new Date().getUTCFullYear();
  const result = await env.INVOICES_DB.prepare(`INSERT INTO invoice_sequences(series,fiscal_year,last_number,updated_at) VALUES(?1,?2,1,?3)
    ON CONFLICT(series,fiscal_year) DO UPDATE SET last_number=last_number+1,updated_at=excluded.updated_at RETURNING last_number`).bind(series, year, now()).first();
  const sequence = Number(result?.last_number);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invoice sequence could not be allocated");
  return { series, year, sequence, requestNumber: `${series}/${year}-${String(sequence).padStart(6, "0")}` };
}

async function event(env, invoiceId, name, data = {}) {
  await env.INVOICES_DB.prepare("INSERT INTO invoice_events(invoice_id,event,event_json,created_at) VALUES(?1,?2,?3,?4)").bind(invoiceId, name, jsonText(data), now()).run();
}

function base64Bytes(value) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function certifiedProvider(env, payload) {
  if (env.INVOICE_PROVIDER !== "certified-api" || !env.CERTIFIED_INVOICE_API_URL || !env.CERTIFIED_INVOICE_API_KEY) {
    throw new Error("Certified Portuguese invoicing provider is not configured");
  }
  const response = await fetch(env.CERTIFIED_INVOICE_API_URL, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.CERTIFIED_INVOICE_API_KEY}`, "Idempotency-Key": payload.requestNumber }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(clean(result.message || `Certified provider HTTP ${response.status}`, 300));
  const required = ["invoiceNumber", "issueDate", "atcud", "qrCodeText", "providerDocumentId", "pdfBase64"];
  if (required.some(key => !result[key])) throw new Error("Certified provider response is incomplete");
  if (!String(result.atcud).startsWith("ATCUD:")) throw new Error("Certified provider returned an invalid ATCUD");
  return result;
}

export async function ensureInvoiceForPayment(env, quote, payment) {
  if (env.INVOICE_ISSUANCE_ENABLED !== "true") return { status: "disabled" };
  if (!env.INVOICES_DB || !env.INVOICE_PDFS) return { status: "configuration_required" };
  const transactionId = clean(payment.transactionId, 80); const tokenHash = await sha256(payment.token);
  if (!transactionId || !payment.token) throw new Error("Verified transaction details are incomplete");
  let existing = await env.INVOICES_DB.prepare("SELECT * FROM invoices WHERE transaction_id=?1").bind(transactionId).first();
  if (existing?.status === "issued") return publicInvoice(existing);
  if (!existing) {
    const seq = await allocateRequestNumber(env); const id = crypto.randomUUID(); const createdAt = now();
    const snapshot = { seller: seller(env), buyer: buyerOf(quote), items: itemsOf(quote), subtotal: quote.subtotal, tax: quote.tax, shipping: quote.shipping, total: quote.total, currency: quote.currency || "EUR", transactionId, quoteReference: quote.quoteReference };
    const recordHash = await sha256(jsonText(snapshot));
    await env.INVOICES_DB.prepare(`INSERT INTO invoices(id,request_number,series,fiscal_year,sequence_number,quote_reference,transaction_id,payment_token_hash,status,seller_json,buyer_json,items_json,subtotal,tax,shipping,total,currency,record_hash,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'pending_provider',?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`)
      .bind(id, seq.requestNumber, seq.series, seq.year, seq.sequence, quote.quoteReference, transactionId, tokenHash, jsonText(snapshot.seller), jsonText(snapshot.buyer), jsonText(snapshot.items), cents(quote.subtotal), cents(quote.tax), cents(quote.shipping), cents(quote.total), snapshot.currency, recordHash, createdAt).run();
    await event(env, id, "invoice_requested", { requestNumber: seq.requestNumber, transactionId });
    existing = await env.INVOICES_DB.prepare("SELECT * FROM invoices WHERE id=?1").bind(id).first();
  }
  try {
    const request = { requestNumber: existing.request_number, documentType: "FT", quoteReference: existing.quote_reference, transactionId: existing.transaction_id, seller: JSON.parse(existing.seller_json), buyer: JSON.parse(existing.buyer_json), items: JSON.parse(existing.items_json), totals: { subtotal: existing.subtotal, tax: existing.tax, shipping: existing.shipping, total: existing.total, currency: existing.currency } };
    const issued = await certifiedProvider(env, request);
    const objectKey = `invoices/${existing.fiscal_year}/${clean(issued.invoiceNumber, 80).replace(/[^A-Za-z0-9._/-]/g, "_")}.pdf`;
    const pdf = base64Bytes(issued.pdfBase64); if (pdf.length < 500 || String.fromCharCode(...pdf.slice(0, 4)) !== "%PDF") throw new Error("Certified provider returned an invalid PDF");
    await env.INVOICE_PDFS.put(objectKey, pdf, { httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${clean(issued.invoiceNumber, 60).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf"` }, customMetadata: { invoiceId: existing.id, recordHash: existing.record_hash } });
    const issuedAt = now();
    await env.INVOICES_DB.prepare(`UPDATE invoices SET status='issued',official_invoice_number=?1,issue_date=?2,atcud=?3,qr_code_text=?4,provider=?5,provider_document_id=?6,pdf_object_key=?7,issued_at=?8,last_error=NULL WHERE id=?9 AND status!='issued'`)
      .bind(clean(issued.invoiceNumber, 80), clean(issued.issueDate, 30), clean(issued.atcud, 100), clean(issued.qrCodeText, 4000), "certified-api", clean(issued.providerDocumentId, 120), objectKey, issuedAt, existing.id).run();
    await event(env, existing.id, "invoice_issued", { invoiceNumber: issued.invoiceNumber, providerDocumentId: issued.providerDocumentId });
  } catch (error) {
    await env.INVOICES_DB.prepare("UPDATE invoices SET status='failed',last_error=?1 WHERE id=?2 AND status!='issued'").bind(clean(error.message, 300), existing.id).run();
    await event(env, existing.id, "invoice_failed", { message: clean(error.message, 300) });
  }
  return publicInvoice(await env.INVOICES_DB.prepare("SELECT * FROM invoices WHERE id=?1").bind(existing.id).first());
}

function publicInvoice(row) {
  if (!row) return { status: "not_found" };
  return { status: row.status, invoiceNumber: row.official_invoice_number || null, requestNumber: row.request_number, issueDate: row.issue_date || null, atcud: row.atcud || null, downloadAvailable: row.status === "issued" && Boolean(row.pdf_object_key) };
}

export async function invoiceForToken(env, token) {
  if (!env.INVOICES_DB) return null;
  return env.INVOICES_DB.prepare("SELECT * FROM invoices WHERE payment_token_hash=?1 AND status='issued'").bind(await sha256(token)).first();
}

export async function invoicePdf(env, token) {
  const row = await invoiceForToken(env, token); if (!row?.pdf_object_key || !env.INVOICE_PDFS) return null;
  return { row, object: await env.INVOICE_PDFS.get(row.pdf_object_key) };
}
