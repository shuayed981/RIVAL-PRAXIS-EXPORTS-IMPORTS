CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  record_reference TEXT NOT NULL UNIQUE,
  order_reference TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL UNIQUE,
  total INTEGER NOT NULL CHECK (total >= 100),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL CHECK (status IN ('paid','failed','refunded')),
  provider_record_json TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  FOREIGN KEY (order_reference) REFERENCES orders(order_reference)
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON payment_transactions(order_reference);
