-- First real registry population. This remains business-independent.

INSERT OR IGNORE INTO companies(id,name,founder,status,created_at,updated_at)
VALUES('company_founder','Founder Company','Jacob Yaghmoor','active',datetime('now'),datetime('now'));

INSERT OR IGNORE INTO workforces(id,company_id,name,purpose,status,created_at,updated_at)
VALUES(
  'workforce_one',
  'company_founder',
  'Workforce 1',
  'Ready operational capacity able to accept governed project and business assignments.',
  'ready',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO workforce_cells(id,workforce_id,name,purpose,status,created_at)
VALUES(
  'cell_workforce_one_operations',
  'workforce_one',
  'Operations Cell',
  'Receive, plan and perform governed work assigned to Workforce 1.',
  'ready',
  datetime('now')
);

INSERT OR IGNORE INTO workforce_positions(
  id,workforce_id,cell_id,title,purpose,position_kind,
  permitted_operator_kinds_json,identity_requirement,
  capability_requirements_json,authority_policy_json,status,created_at,updated_at
)
VALUES
(
  'position_workforce_one_maintainer',
  'workforce_one',
  'cell_workforce_one_operations',
  'Project Maintainer',
  'Inspect, maintain, test and improve an assigned project within its granted sandbox.',
  'operational',
  '["human","ai"]',
  'none',
  '["repository_inspection","code_editing","test_execution","maintenance_planning"]',
  '{"repository_scope":"assigned_only","default_branch_write":false,"production_deployment":false,"material_changes_require_approval":true}',
  'vacant',
  datetime('now'),
  datetime('now')
),
(
  'position_workforce_one_verifier',
  'workforce_one',
  'cell_workforce_one_operations',
  'Independent Verifier',
  'Verify claimed outcomes using tests and evidence independently from the executing position.',
  'verification',
  '["human","ai","automation"]',
  'none',
  '["evidence_review","test_execution","acceptance_verification"]',
  '{"project_write":false,"production_deployment":false,"verification_only":true}',
  'vacant',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO workforce_operators(
  id,name,operator_kind,capability_profile_json,runtime_config_json,status,created_at,updated_at
)
VALUES
(
  'operator_workforce_one_maintainer',
  'Workforce 1 Maintenance Operator',
  'ai',
  '{"repository_inspection":true,"code_editing":true,"test_execution":true,"maintenance_planning":true}',
  '{"model_role":"operations","environment_managed":true}',
  'available',
  datetime('now'),
  datetime('now')
),
(
  'operator_workforce_one_verifier',
  'Workforce 1 Verification Operator',
  'automation',
  '{"evidence_review":true,"test_execution":true,"acceptance_verification":true}',
  '{"deterministic_checks_preferred":true,"environment_managed":true}',
  'available',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO position_occupancies(
  id,position_id,operator_id,authority_grant_json,status,started_at
)
VALUES
(
  'occupancy_workforce_one_maintainer',
  'position_workforce_one_maintainer',
  'operator_workforce_one_maintainer',
  '{"repository_scope":"assigned_only","sandbox_branch_write":true,"default_branch_write":false,"production_deployment":false}',
  'active',
  datetime('now')
),
(
  'occupancy_workforce_one_verifier',
  'position_workforce_one_verifier',
  'operator_workforce_one_verifier',
  '{"read_evidence":true,"run_approved_checks":true,"project_write":false}',
  'active',
  datetime('now')
);

UPDATE workforce_positions
SET status='occupied',updated_at=datetime('now')
WHERE id IN ('position_workforce_one_maintainer','position_workforce_one_verifier');

UPDATE workforce_operators
SET status='assigned',updated_at=datetime('now')
WHERE id IN ('operator_workforce_one_maintainer','operator_workforce_one_verifier');

INSERT OR IGNORE INTO loadouts(
  id,company_id,name,version,purpose,components_json,resource_requirements_json,status,created_at,updated_at
)
VALUES(
  'loadout_software_work_v1',
  'company_founder',
  'Software Work Base Loadout',
  1,
  'Provide the integrated dependencies needed for governed local software work.',
  '[{"key":"repository_workspace","required":true},{"key":"version_control","required":true},{"key":"coding_tools","required":true},{"key":"test_runner","required":true},{"key":"model_provider","required":true},{"key":"scheduler","required":true},{"key":"audit_storage","required":true},{"key":"approval_interface","required":true}]',
  '{"environment_class":"laptop_or_better","network":"restricted","persistent_storage":true}',
  'ready',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO workforce_loadouts(workforce_id,loadout_id,status,attached_at)
VALUES('workforce_one','loadout_software_work_v1','required',datetime('now'));
