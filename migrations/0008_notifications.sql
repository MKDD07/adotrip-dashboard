CREATE TABLE IF NOT EXISTS crm_activity (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 entity TEXT NOT NULL,
 action TEXT NOT NULL,
 student_id TEXT,
 label TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_activity_created ON crm_activity(created_at DESC);
CREATE TABLE IF NOT EXISTS notification_receipts (
 user_id TEXT NOT NULL,
 notification_id TEXT NOT NULL,
 is_read INTEGER NOT NULL DEFAULT 0,
 dismissed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,notification_id)
);
