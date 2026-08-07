ALTER TABLE payment_transactions ADD COLUMN confirmation_html TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  attempt_reference TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  order_reference TEXT NOT NULL,
  quote_reference TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 100),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL CHECK (status IN ('initialized','unconfirmed','failed','canceled','paid')),
  result_code TEXT,
  transaction_status INTEGER,
  provider_message TEXT,
  transaction_id TEXT,
  verification_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT,
  FOREIGN KEY (order_reference) REFERENCES orders(order_reference)
);

CREATE INDEX IF NOT EXISTS payment_attempts_order_idx ON payment_attempts(order_reference, created_at);
