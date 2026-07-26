CREATE TABLE IF NOT EXISTS enrollment_tokens (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS environment_devices (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL UNIQUE REFERENCES environments(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  enrolled_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS connector_nonces (
  device_id TEXT NOT NULL REFERENCES environment_devices(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY(device_id, nonce)
);
CREATE TABLE IF NOT EXISTS connector_commands (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  UNIQUE(environment_id, sequence)
);
CREATE TABLE IF NOT EXISTS connector_events (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  command_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connector_commands_pending ON connector_commands(environment_id,status,sequence);
CREATE INDEX IF NOT EXISTS idx_connector_events_environment ON connector_events(environment_id,received_at DESC);
