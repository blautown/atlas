PRAGMA foreign_keys = OFF;

ALTER TABLE conversations RENAME TO conversations_v2;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('ada','manager','development')),
  owner_id TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO conversations(id,kind,owner_id,created_at)
SELECT id,kind,owner_id,created_at FROM conversations_v2;

ALTER TABLE messages RENAME TO messages_v2;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO messages(id,conversation_id,role,content,created_at)
SELECT id,conversation_id,role,content,created_at FROM messages_v2;

ALTER TABLE assistant_jobs RENAME TO assistant_jobs_v2;

CREATE TABLE assistant_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('ada','manager','development')),
  owner_id TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  milestone_id TEXT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','working','waiting_approval','needs_input','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  stage TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);

INSERT INTO assistant_jobs(
  id,kind,owner_id,conversation_id,milestone_id,prompt,status,progress,stage,
  result_json,error,created_at,updated_at,heartbeat_at
)
SELECT
  id,kind,owner_id,conversation_id,milestone_id,prompt,status,progress,stage,
  result_json,error,created_at,updated_at,heartbeat_at
FROM assistant_jobs_v2;

ALTER TABLE job_approvals RENAME TO job_approvals_v2;

CREATE TABLE job_approvals (
  job_id TEXT NOT NULL REFERENCES assistant_jobs(id) ON DELETE CASCADE,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  PRIMARY KEY(job_id, approval_id)
);

INSERT INTO job_approvals(job_id,approval_id)
SELECT job_id,approval_id FROM job_approvals_v2;

DROP TABLE job_approvals_v2;
DROP TABLE assistant_jobs_v2;
DROP TABLE messages_v2;
DROP TABLE conversations_v2;

CREATE INDEX IF NOT EXISTS idx_assistant_jobs_updated ON assistant_jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_jobs_status ON assistant_jobs(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

PRAGMA foreign_keys = ON;
