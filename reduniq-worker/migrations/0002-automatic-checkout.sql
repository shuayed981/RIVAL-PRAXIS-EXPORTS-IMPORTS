CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  receipt_reference TEXT NOT NULL UNIQUE,
  order_reference TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 100),
  currency TEXT NOT NULL DEFAULT 'EUR',
  receipt_json TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  FOREIGN KEY (order_reference) REFERENCES orders(order_reference)
);

CREATE INDEX IF NOT EXISTS payment_receipts_order_idx ON payment_receipts(order_reference);
