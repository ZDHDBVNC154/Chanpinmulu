-- 0041_inquiry_intelligence — first-party attribution and privacy-conscious
-- inquiry risk signals. Raw visitor IPs are not retained: only a masked display
-- value and a keyed hash used for repeat-submission counts are stored.

ALTER TABLE inquiries ADD COLUMN client_ip_masked TEXT;
ALTER TABLE inquiries ADD COLUMN client_ip_hash TEXT;
ALTER TABLE inquiries ADD COLUMN ip_country TEXT;
ALTER TABLE inquiries ADD COLUMN ip_region TEXT;
ALTER TABLE inquiries ADD COLUMN ip_city TEXT;
ALTER TABLE inquiries ADD COLUMN ip_timezone TEXT;
ALTER TABLE inquiries ADD COLUMN ip_asn INTEGER;
ALTER TABLE inquiries ADD COLUMN ip_as_organization TEXT;
ALTER TABLE inquiries ADD COLUMN browser_timezone TEXT;
ALTER TABLE inquiries ADD COLUMN device_type TEXT;
ALTER TABLE inquiries ADD COLUMN device_os TEXT;
ALTER TABLE inquiries ADD COLUMN browser_name TEXT;
ALTER TABLE inquiries ADD COLUMN source TEXT;
ALTER TABLE inquiries ADD COLUMN source_detail TEXT;
ALTER TABLE inquiries ADD COLUMN landing_url TEXT;
ALTER TABLE inquiries ADD COLUMN referrer TEXT;
ALTER TABLE inquiries ADD COLUMN utm_source TEXT;
ALTER TABLE inquiries ADD COLUMN utm_medium TEXT;
ALTER TABLE inquiries ADD COLUMN utm_campaign TEXT;
ALTER TABLE inquiries ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low'
  CHECK (risk_level IN ('low', 'medium', 'high'));
ALTER TABLE inquiries ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inquiries ADD COLUMN risk_signals TEXT;
ALTER TABLE inquiries ADD COLUMN history_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inquiries ADD COLUMN bot_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_inquiries_ip_hash_created
  ON inquiries(client_ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_email_created
  ON inquiries(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_risk_created
  ON inquiries(risk_level, created_at DESC);
