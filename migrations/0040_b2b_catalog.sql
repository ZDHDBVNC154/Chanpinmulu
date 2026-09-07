-- 0040_b2b_catalog — factory catalog fields and RFQ inquiries.
-- Product columns are additive so existing Minshop catalogs remain readable.

ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN name_zh TEXT;
ALTER TABLE products ADD COLUMN material TEXT;
ALTER TABLE products ADD COLUMN dimensions TEXT;
ALTER TABLE products ADD COLUMN colors TEXT;
ALTER TABLE products ADD COLUMN moq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN inner_pack TEXT;
ALTER TABLE products ADD COLUMN carton_pack TEXT;
ALTER TABLE products ADD COLUMN carton_size TEXT;
ALTER TABLE products ADD COLUMN gross_weight TEXT;
ALTER TABLE products ADD COLUMN net_weight TEXT;
ALTER TABLE products ADD COLUMN sample_lead_time TEXT;
ALTER TABLE products ADD COLUMN production_lead_time TEXT;
ALTER TABLE products ADD COLUMN certifications TEXT;
ALTER TABLE products ADD COLUMN oem_available INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN is_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN show_price INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products(sku) WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, active);
CREATE INDEX IF NOT EXISTS idx_products_new ON products(is_new, active);

CREATE TABLE IF NOT EXISTS inquiries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id       TEXT NOT NULL UNIQUE,
  reference       TEXT NOT NULL UNIQUE,
  contact_name    TEXT NOT NULL,
  company         TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  country         TEXT NOT NULL,
  target_delivery TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'quoted', 'closed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inquiry_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_public_id TEXT NOT NULL,
  product_public_id TEXT,
  product_id        INTEGER,
  sku               TEXT,
  name              TEXT NOT NULL,
  option_label      TEXT,
  quantity          INTEGER NOT NULL DEFAULT 1,
  notes             TEXT,
  FOREIGN KEY (inquiry_public_id) REFERENCES inquiries(public_id)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_items_parent ON inquiry_items(inquiry_public_id);
