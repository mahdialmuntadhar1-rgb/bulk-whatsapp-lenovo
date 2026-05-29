-- Production D1 SQLite Schema for Nabda Bulk Orchestration Platform

-- 1. WhatsApp Nabda Instances
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT DEFAULT 'connected',
  last_active_at TEXT,
  created_at TEXT NOT NULL
);

-- 2. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, QUEUED, PROCESSING, PAUSED, CANCELLED, COMPLETED
  instance_id TEXT NOT NULL,
  pacing_delay_min INTEGER DEFAULT 4,
  pacing_delay_max INTEGER DEFAULT 12,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  FOREIGN KEY(instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

-- 3. Campaign Messages (Queued individually)
CREATE TABLE IF NOT EXISTS campaign_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_url TEXT,
  fingerprint TEXT NOT NULL, -- campaign_id:phone:messageHash:attachmentUrl
  status TEXT DEFAULT 'PENDING', -- PENDING, QUEUED, PROCESSING, SENT, DELIVERED, FAILED, SKIPPED_DUPLICATE, CANCELLED
  retry_count INTEGER DEFAULT 0,
  provider_message_id TEXT,
  retry_reason TEXT,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Indexing for rapid queue extraction, duplicates lookups, and statuses filtering
CREATE INDEX IF NOT EXISTS idx_msg_status ON campaign_messages(status);
CREATE INDEX IF NOT EXISTS idx_msg_fingerprint ON campaign_messages(fingerprint);
CREATE INDEX IF NOT EXISTS idx_msg_cmp_status ON campaign_messages(campaign_id, status);

-- 4. Send Attempts History Log
CREATE TABLE IF NOT EXISTS send_attempts (
  id TEXT PRIMARY KEY,
  campaign_message_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  provider_response TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(campaign_message_id) REFERENCES campaign_messages(id) ON DELETE CASCADE
);

-- 5. Webhook Events Audit
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
