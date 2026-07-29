-- ATLAS V1 actor-centred operating model.

CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identity TEXT NOT NULL,
  personality TEXT NOT NULL,
  relationship TEXT NOT NULL,
  memory_config_json TEXT NOT NULL DEFAULT '{}',
  model_config_json TEXT NOT NULL DEFAULT '{}',
  autonomy_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  availability TEXT NOT NULL DEFAULT '',
  escalation_preferences_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','assessing','partially_deployed','operational','degraded','suspended','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_goals (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_outcomes (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES actor_goals(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL CHECK(operator IN ('gte','lte','eq','contains')),
  threshold_json TEXT NOT NULL,
  observation_window TEXT NOT NULL,
  current_value_json TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','healthy','drifting','failed')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_routine_tasks (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES actor_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  intention TEXT NOT NULL,
  timing_text TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','blocked','ready','active','paused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_schedule_versions (
  id TEXT PRIMARY KEY,
  routine_task_id TEXT NOT NULL REFERENCES actor_routine_tasks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  timezone TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  overlap_policy TEXT NOT NULL,
  missed_run_policy TEXT NOT NULL,
  retry_limit INTEGER NOT NULL DEFAULT 0,
  lateness_threshold_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','superseded')),
  approved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(routine_task_id,version)
);

CREATE TABLE IF NOT EXISTS actor_skills (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','rehearsing','proven','failed','retired')),
  current_version_id TEXT,
  template_source_id TEXT REFERENCES skill_templates(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES actor_skills(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  steps_json TEXT NOT NULL,
  inputs_json TEXT NOT NULL,
  verification_json TEXT NOT NULL,
  recovery_json TEXT NOT NULL,
  dependencies_json TEXT NOT NULL,
  rehearsal_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','rehearsing','proven','failed','superseded')),
  approved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(skill_id,version)
);

CREATE TABLE IF NOT EXISTS routine_task_skills (
  routine_task_id TEXT NOT NULL REFERENCES actor_routine_tasks(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES actor_skills(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(routine_task_id,skill_id)
);

CREATE TABLE IF NOT EXISTS skill_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  source_actor_skill_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environment_capability_snapshots (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  capabilities_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environment_capacity_snapshots (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  capacity_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environmental_skill_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manager_environmental_skills (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL REFERENCES environmental_skill_definitions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unproven' CHECK(status IN ('unproven','rehearsing','proven','unhealthy')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  health_gate_json TEXT NOT NULL DEFAULT '{}',
  proven_at TEXT,
  checked_at TEXT NOT NULL,
  UNIQUE(manager_id,environment_id,definition_id)
);

CREATE TABLE IF NOT EXISTS actor_deployments (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  manager_id TEXT NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('assessing','partially_deployed','operational','degraded','suspended','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_active_deployment
ON actor_deployments(actor_id) WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS environmental_configurations (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES actor_deployments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  config_json TEXT NOT NULL,
  secret_ref_id TEXT REFERENCES secret_references(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','unhealthy','revoked')),
  health_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployment_manifests (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES actor_deployments(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(deployment_id,version)
);

CREATE TABLE IF NOT EXISTS deployment_task_bindings (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES actor_deployments(id) ON DELETE CASCADE,
  routine_task_id TEXT NOT NULL REFERENCES actor_routine_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('blocked','ready','active','paused')),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  next_run_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(deployment_id,routine_task_id)
);

CREATE TABLE IF NOT EXISTS actor_health_gates (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES actor_deployments(id) ON DELETE CASCADE,
  routine_task_id TEXT REFERENCES actor_routine_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','healthy','unhealthy')),
  last_checked_at TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS actor_conversations (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL UNIQUE REFERENCES actors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES actor_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','actor','manager')),
  content TEXT NOT NULL,
  proactive INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actor_tasks ON actor_routine_tasks(actor_id,status);
CREATE INDEX IF NOT EXISTS idx_actor_skills ON actor_skills(actor_id,status);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON actor_deployments(environment_id,status);
CREATE INDEX IF NOT EXISTS idx_actor_messages ON actor_messages(conversation_id,created_at);
