ALTER TABLE auth_sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS auth_sessions_presence ON auth_sessions(user_id,last_seen,expires_at);
