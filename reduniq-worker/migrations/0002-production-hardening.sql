CREATE TABLE IF NOT EXISTS payment_sessions (
  token_hash TEXT PRIMARY KEY,
  payment_token TEXT NOT NULL,
  quote_reference TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 100),
  currency TEXT NOT NULL DEFAULT 'EUR',
  redirect_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','failed')),
  transaction_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_reference) REFERENCES commerce_quotes(quote_reference)
);
CREATE INDEX IF NOT EXISTS payment_sessions_quote_idx ON payment_sessions(quote_reference, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_one_pending_per_quote_idx ON payment_sessions(quote_reference) WHERE status='pending';

CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits(expires_at);
