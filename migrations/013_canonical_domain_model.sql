-- Canonical Stage 1 domain model (additive, non-destructive)

CREATE TABLE IF NOT EXISTS canonical_founder_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_businesses (
  id TEXT PRIMARY KEY,
  founder_company_id TEXT NOT NULL REFERENCES canonical_founder_companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_workforces (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES canonical_businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_cells (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES canonical_workforces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_positions (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES canonical_workforces(id) ON DELETE CASCADE,
  cell_id TEXT REFERENCES canonical_cells(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  current_operator_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  operator_type TEXT NOT NULL DEFAULT 'ai' CHECK(operator_type IN ('human','ai','automation','hybrid')),
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  persona_id TEXT REFERENCES canonical_personas(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_position_assignments (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL REFERENCES canonical_positions(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL REFERENCES canonical_operators(id) ON DELETE RESTRICT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'local',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_environment_managers (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES canonical_environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_dependencies (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_capabilities (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  label TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_sessions (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES canonical_environments(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_credential_references (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  location TEXT NOT NULL,
  content TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_schedules (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_executions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES canonical_position_assignments(id) ON DELETE RESTRICT,
  skill_id TEXT REFERENCES canonical_skills(id) ON DELETE SET NULL,
  schedule_id TEXT REFERENCES canonical_schedules(id) ON DELETE SET NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_approvals (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_positions_workforce ON canonical_positions(workforce_id,lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_domain_assignments_position ON canonical_position_assignments(position_id,lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_domain_assignments_operator ON canonical_position_assignments(operator_id,lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_domain_sessions_environment ON canonical_sessions(environment_id,lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_domain_credentials_scope ON canonical_credential_references(scope,lifecycle_status);
