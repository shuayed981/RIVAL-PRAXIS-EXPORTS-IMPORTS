PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  request_reference TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  estimated_subtotal INTEGER NOT NULL CHECK (estimated_subtotal >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested','reviewing','quoted','declined','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_quotes (
  id TEXT PRIMARY KEY,
  quote_reference TEXT NOT NULL UNIQUE,
  request_id TEXT,
  customer_email TEXT NOT NULL,
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  tax INTEGER NOT NULL CHECK (tax >= 0),
  shipping INTEGER NOT NULL CHECK (shipping >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL CHECK (status IN ('draft','sent','accepted','expired','cancelled','paid')),
  acceptance_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  sent_at TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES quote_requests(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_reference TEXT NOT NULL UNIQUE,
  quote_id TEXT NOT NULL UNIQUE,
  quote_reference TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment','payment_pending','paid','processing','shipped','delivered','cancelled','refunded')),
  transaction_id TEXT,
  tracking_reference TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES commerce_quotes(id)
);

CREATE TABLE IF NOT EXISTS commerce_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipients_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent','skipped','failed')),
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quote_requests_email_idx ON quote_requests(customer_email);
CREATE INDEX IF NOT EXISTS commerce_quotes_request_idx ON commerce_quotes(request_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS commerce_events_entity_idx ON commerce_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS payment_sessions_quote_idx ON payment_sessions(quote_reference, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_one_pending_per_quote_idx ON payment_sessions(quote_reference) WHERE status='pending';
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits(expires_at);
