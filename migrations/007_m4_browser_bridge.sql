CREATE TABLE IF NOT EXISTS browser_pair_tokens (
 id TEXT PRIMARY KEY, environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS browser_sessions (
 id TEXT PRIMARY KEY, environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
 manager_id TEXT NOT NULL REFERENCES managers(id) ON DELETE CASCADE, public_key TEXT NOT NULL,
 tab_ref TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('connected','disconnected','revoked')),
 consented_at TEXT NOT NULL, last_seen_at TEXT, disconnected_at TEXT, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS browser_nonces (
 session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE, nonce TEXT NOT NULL, seen_at TEXT NOT NULL,
 PRIMARY KEY(session_id,nonce)
);
CREATE TABLE IF NOT EXISTS browser_commands (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
 manager_id TEXT NOT NULL REFERENCES managers(id) ON DELETE CASCADE, action TEXT NOT NULL, args_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL, delivered_at TEXT, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS browser_events (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
 command_id TEXT, type TEXT NOT NULL, payload_json TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_browser_commands_pending ON browser_commands(session_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_browser_events_session ON browser_events(session_id,received_at DESC);
