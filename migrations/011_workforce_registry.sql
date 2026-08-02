-- Workforce-first organisational registry.
-- Workforces exist independently; businesses are attached through assignments.

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  founder TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planning',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workforces (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'forming' CHECK(status IN ('forming','ready','assigned','active','suspended','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workforce_business_assignments (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES workforces(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  mandate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','paused','completed','cancelled')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_active_business_assignment
ON workforce_business_assignments(workforce_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS workforce_cells (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES workforces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workforce_positions (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES workforces(id) ON DELETE CASCADE,
  cell_id TEXT REFERENCES workforce_cells(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  position_kind TEXT NOT NULL DEFAULT 'operational' CHECK(position_kind IN ('manager','operational','verification','support')),
  permitted_operator_kinds_json TEXT NOT NULL DEFAULT '["human","ai"]',
  identity_requirement TEXT NOT NULL DEFAULT 'none' CHECK(identity_requirement IN ('none','system','organisational','public','personal')),
  capability_requirements_json TEXT NOT NULL DEFAULT '[]',
  authority_policy_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'vacant' CHECK(status IN ('vacant','occupied','suspended','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workforce_operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  operator_kind TEXT NOT NULL CHECK(operator_kind IN ('human','ai','automation')),
  capability_profile_json TEXT NOT NULL DEFAULT '{}',
  runtime_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','assigned','offline','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS position_occupancies (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL REFERENCES workforce_positions(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL REFERENCES workforce_operators(id) ON DELETE RESTRICT,
  authority_grant_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','ended')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_active_occupancy
ON position_occupancies(position_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS loadouts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  purpose TEXT NOT NULL,
  components_json TEXT NOT NULL DEFAULT '[]',
  resource_requirements_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','superseded','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id,name,version)
);

CREATE TABLE IF NOT EXISTS workforce_loadouts (
  workforce_id TEXT NOT NULL REFERENCES workforces(id) ON DELETE CASCADE,
  loadout_id TEXT NOT NULL REFERENCES loadouts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'required' CHECK(status IN ('required','provisioning','ready','unhealthy')),
  attached_at TEXT NOT NULL,
  PRIMARY KEY(workforce_id,loadout_id)
);

CREATE TABLE IF NOT EXISTS workforce_deployments (
  id TEXT PRIMARY KEY,
  workforce_id TEXT NOT NULL REFERENCES workforces(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','provisioning','sandboxed','ready','active','degraded','suspended','retired')),
  readiness_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_active_deployment
ON workforce_deployments(workforce_id) WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_registry_assignments_business ON workforce_business_assignments(business_id,status);
CREATE INDEX IF NOT EXISTS idx_registry_positions_workforce ON workforce_positions(workforce_id,status);
CREATE INDEX IF NOT EXISTS idx_registry_deployments_environment ON workforce_deployments(environment_id,status);
