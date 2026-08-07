const RATE_WINDOW_SECONDS = 60 * 15;
const RATE_LIMIT = 12;
const MAX_REQUEST_BYTES = 262144;
const textEncoder = new TextEncoder();

export const normalize = (value, max = 150) => String(value || "").trim().slice(0, max);
export const escapeHtml = value => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
export const amountText = (cents, currency = "EUR") => `${(Number(cents || 0) / 100).toFixed(2)} ${normalize(currency, 3).toUpperCase() || "EUR"}`;
export const orderDate = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export function base64Utf8(value) {
  const bytes = textEncoder.encode(String(value || "")); let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function jsonResponse(body, status = 200, origin = "https://rivalpraxis.com") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Vary": "Origin",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

export function allowedOrigin(request, env) {
  const expected = env.SITE_ORIGIN || "https://rivalpraxis.com";
  const origin = request.headers.get("Origin");
  return !origin || origin === expected ? expected : null;
}

export async function bodyOf(request) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new Error("JSON_REQUIRED");
  if (Number(request.headers.get("Content-Length") || 0) > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("JSON_INVALID");
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error("REQUEST_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("JSON_INVALID"); }
}

export async function sha256Hex(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value))))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([left, right].map(async value => new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)))));
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) difference |= leftHash[index] ^ rightHash[index];
  return difference === 0;
}

export async function isAdmin(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || ""); const supplied = String(request.headers.get("Authorization") || "");
  return expected.length >= 32 && await secureEqual(supplied, `Bearer ${expected}`);
}

export async function enforceRateLimit(request, env, action) {
  const address = normalize(request.headers.get("CF-Connecting-IP") || "unknown", 64);
  const key = `rate:${action}:${address}`;
  const now = Math.floor(Date.now() / 1000); const expires = now + RATE_WINDOW_SECONDS;
  const row = await env.INVOICES_DB.prepare(`INSERT INTO api_rate_limits(rate_key,request_count,expires_at)
    VALUES(?1,1,?2)
    ON CONFLICT(rate_key) DO UPDATE SET
      request_count=CASE WHEN expires_at<=?3 THEN 1 ELSE request_count+1 END,
      expires_at=CASE WHEN expires_at<=?3 THEN ?2 ELSE expires_at END
    RETURNING request_count,expires_at`).bind(key, expires, now).first();
  return Number(row?.request_count || RATE_LIMIT + 1) <= RATE_LIMIT;
}

export async function audit(env, reference, event, details = {}) {
  await env.INVOICES_DB.prepare(`INSERT INTO commerce_events(entity_type,entity_id,event,event_json,created_at)
    VALUES('quote',?1,?2,?3,?4)`).bind(normalize(reference, 50).toUpperCase(), event, JSON.stringify(details), new Date().toISOString()).run();
}
