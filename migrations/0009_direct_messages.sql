CREATE TABLE IF NOT EXISTS direct_messages (
 id TEXT PRIMARY KEY,
 sender_id TEXT NOT NULL REFERENCES auth_users(id),
 recipient_id TEXT NOT NULL REFERENCES auth_users(id),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL,
 read_at TEXT
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation ON direct_messages(sender_id,recipient_id,created_at);
CREATE INDEX IF NOT EXISTS direct_messages_unread ON direct_messages(recipient_id,read_at,sender_id);
