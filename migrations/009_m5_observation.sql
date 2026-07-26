CREATE TABLE IF NOT EXISTS observation_sessions (
 id TEXT PRIMARY KEY, browser_session_id TEXT NOT NULL REFERENCES browser_sessions(id) ON DELETE CASCADE,
 environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE, manager_id TEXT NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('observation','hybrid')), instructions TEXT,
 scope_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('recording','analyzing','review','approved','cancelled')),
 started_at TEXT NOT NULL, stopped_at TEXT
);
CREATE TABLE IF NOT EXISTS observation_actions (
 id TEXT PRIMARY KEY, observation_id TEXT NOT NULL REFERENCES observation_sessions(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL, target TEXT, value_json TEXT NOT NULL,
 url TEXT, occurred_at TEXT NOT NULL, UNIQUE(observation_id,event_id,sequence)
);
CREATE TABLE IF NOT EXISTS workflow_drafts (
 id TEXT PRIMARY KEY, observation_id TEXT NOT NULL UNIQUE REFERENCES observation_sessions(id) ON DELETE CASCADE,
 workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL, name TEXT NOT NULL, graph_json TEXT NOT NULL,
 requirements_json TEXT NOT NULL, corrections_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL CHECK(status IN ('draft','rehearsing','rehearsed','approval_pending','approved')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS workflow_rehearsals (
 id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES workflow_drafts(id) ON DELETE CASCADE,
 browser_command_id TEXT, status TEXT NOT NULL, deviations_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_observation_actions ON observation_actions(observation_id,sequence);
