CREATE TABLE IF NOT EXISTS model_role_settings (
 role TEXT PRIMARY KEY CHECK(role IN ('ada','operations')),
 provider TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT, secret_ref_id TEXT,
 timeout_ms INTEGER NOT NULL DEFAULT 120000, updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO model_role_settings(role,provider,model,base_url,secret_ref_id,timeout_ms,updated_at)
 SELECT 'ada',provider,model,base_url,secret_ref_id,timeout_ms,updated_at FROM platform_settings WHERE id='default';
INSERT OR IGNORE INTO model_role_settings(role,provider,model,base_url,secret_ref_id,timeout_ms,updated_at)
 SELECT 'operations',provider,model,base_url,secret_ref_id,timeout_ms,updated_at FROM platform_settings WHERE id='default';
