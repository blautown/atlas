CREATE TABLE IF NOT EXISTS assistant_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('manager','development')),
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

CREATE TABLE IF NOT EXISTS job_approvals (
  job_id TEXT NOT NULL REFERENCES assistant_jobs(id) ON DELETE CASCADE,
  approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  PRIMARY KEY(job_id, approval_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_jobs_updated ON assistant_jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_jobs_status ON assistant_jobs(status);
