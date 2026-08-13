import test from "node:test";
import assert from "node:assert/strict";
import { runScheduledMaintenance } from "../reduniq-worker/worker.js";

function databaseWith(runForSql) {
  return {
    prepare(sql) {
      return { bind: value => ({ run: () => runForSql(sql, value) }) };
    },
  };
}

async function withCapturedConsole(action) {
  const originalLog = console.log; const originalError = console.error;
  const logs = []; const errors = [];
  console.log = value => logs.push(String(value));
  console.error = value => errors.push(String(value));
  try { await action(); } finally { console.log = originalLog; console.error = originalError; }
  return { logs, errors };
}

test("scheduled maintenance runs sequentially and retries only idempotent cleanup", async () => {
  const calls = []; let rateLimitAttempts = 0;
  const env = { INVOICES_DB: databaseWith(async sql => {
    if (sql.includes("api_rate_limits")) {
      calls.push(`rate-${++rateLimitAttempts}`);
      if (rateLimitAttempts < 3) throw new Error("D1_ERROR: internal error; reference = safe-reference");
      return;
    }
    calls.push("sessions-cleanup");
  }) };
  await withCapturedConsole(() => runScheduledMaintenance(env, {
    reconcile: async () => { calls.push("reconcile"); },
    sleep: async delay => { calls.push(`sleep-${delay}`); },
  }));
  assert.deepEqual(calls, ["rate-1", "sleep-100", "rate-2", "sleep-200", "rate-3", "reconcile", "sessions-cleanup"]);
});

test("a failed cleanup does not stop remaining steps but preserves failed cron status", async () => {
  const calls = [];
  const env = { INVOICES_DB: databaseWith(async sql => {
    if (sql.includes("api_rate_limits")) { calls.push("rate"); throw new Error("D1_ERROR: internal error"); }
    calls.push("sessions-cleanup");
  }) };
  await withCapturedConsole(async () => {
    await assert.rejects(runScheduledMaintenance(env, {
      reconcile: async () => { calls.push("reconcile"); },
      sleep: async () => {},
    }), /SCHEDULED_MAINTENANCE_FAILED:expired_rate_limits_cleanup/);
  });
  assert.deepEqual(calls, ["rate", "rate", "rate", "reconcile", "sessions-cleanup"]);
});

test("payment reconciliation is attempted once and later cleanup still runs after failure", async () => {
  const calls = []; let reconciliationAttempts = 0;
  const env = { INVOICES_DB: databaseWith(async sql => { calls.push(sql.includes("api_rate_limits") ? "rate" : "sessions-cleanup"); }) };
  await withCapturedConsole(async () => {
    await assert.rejects(runScheduledMaintenance(env, {
      reconcile: async () => { reconciliationAttempts += 1; calls.push("reconcile"); throw new Error("temporary provider failure"); },
      sleep: async () => {},
    }), /SCHEDULED_MAINTENANCE_FAILED:pending_payment_reconciliation/);
  });
  assert.equal(reconciliationAttempts, 1);
  assert.deepEqual(calls, ["rate", "reconcile", "sessions-cleanup"]);
});

test("scheduled error logs expose only the step, attempt and sanitized D1 reference", async () => {
  const secret = "sensitive-token-value";
  const env = { INVOICES_DB: databaseWith(async sql => {
    if (sql.includes("api_rate_limits")) throw new Error(`D1_ERROR: internal error; reference = safe-reference; token=${secret}; https://sensitive.invalid/${secret}`);
  }) };
  let captured;
  captured = await withCapturedConsole(async () => {
    await assert.rejects(runScheduledMaintenance(env, { reconcile: async () => {}, sleep: async () => {} }));
  });
  assert.equal(captured.errors.length, 3);
  for (const entry of captured.errors) {
    const parsed = JSON.parse(entry);
    assert.equal(parsed.event, "scheduled_step_error");
    assert.equal(parsed.step, "expired_rate_limits_cleanup");
    assert.equal(parsed.message, "D1_ERROR: reference = safe-reference");
    assert.doesNotMatch(entry, new RegExp(secret));
    assert.doesNotMatch(entry, /sensitive\.invalid/);
  }
});
