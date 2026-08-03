PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS invoice_sequences (
  series TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (series, fiscal_year)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  series TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL,
  quote_reference TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  payment_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_provider','issued','failed')),
  document_type TEXT NOT NULL DEFAULT 'FT',
  official_invoice_number TEXT UNIQUE,
  issue_date TEXT,
  seller_json TEXT NOT NULL,
  buyer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  tax INTEGER NOT NULL CHECK (tax >= 0),
  shipping INTEGER NOT NULL CHECK (shipping >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  atcud TEXT,
  qr_code_text TEXT,
  provider TEXT,
  provider_document_id TEXT,
  pdf_object_key TEXT,
  record_hash TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  issued_at TEXT,
  UNIQUE (series, fiscal_year, sequence_number)
);

CREATE TABLE IF NOT EXISTS invoice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  event TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX IF NOT EXISTS invoices_quote_reference_idx ON invoices(quote_reference);
CREATE INDEX IF NOT EXISTS invoices_payment_token_hash_idx ON invoices(payment_token_hash);
CREATE INDEX IF NOT EXISTS invoice_events_invoice_id_idx ON invoice_events(invoice_id);
