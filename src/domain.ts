import type { AtlasDatabase } from "./db.js";
import { id, json, now, parseJson } from "./util.js";

type Row = Record<string, any>;

type LifecycleStatus = "draft" | "active" | "inactive" | "suspended" | "archived" | "disconnected" | "degraded" | "failed" | "completed" | "cancelled";

type OperatorType = "human" | "ai" | "automation" | "hybrid";

type PackageVersion = `${number}.${number}.${number}`;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isVersion(value: string): value is PackageVersion {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function lifecycle(value: unknown, fallback: LifecycleStatus): LifecycleStatus {
  const statuses: LifecycleStatus[] = ["draft", "active", "inactive", "suspended", "archived", "disconnected", "degraded", "failed", "completed", "cancelled"];
  return typeof value === "string" && statuses.includes(value as LifecycleStatus) ? (value as LifecycleStatus) : fallback;
}

function assignmentLifecycle(value: unknown): LifecycleStatus {
  const statuses: LifecycleStatus[] = ["draft", "active", "inactive", "suspended", "archived", "disconnected", "degraded", "failed", "completed", "cancelled"];
  if (value === undefined) return "active";
  if (typeof value === "string" && statuses.includes(value as LifecycleStatus)) return value as LifecycleStatus;
  throw new Error("Invalid assignment state; expected a supported lifecycle status.");
}

function operatorType(value: unknown): OperatorType {
  if (value === "human" || value === "ai" || value === "automation" || value === "hybrid") return value;
  throw new Error("Invalid operator type; expected one of: human, ai, automation, hybrid.");
}

function normalizePackageVersion(value: unknown): PackageVersion {
  if (typeof value !== "string" || !isVersion(value)) throw new Error("Invalid schema version; expected semantic version like 1.0.0.");
  return value as PackageVersion;
}

export class CanonicalDomainService {
  constructor(readonly db: AtlasDatabase) {}

  private hydrate(row: Row): Row {
    const result: Row = { ...row };
    if ("metadata_json" in result) {
      result.metadata = parseJson(result.metadata_json, {});
      delete result.metadata_json;
    }
    const aliases: Array<[string, string]> = [
      ["founder_company_id", "founderCompanyId"],
      ["business_id", "businessId"],
      ["workforce_id", "workforceId"],
      ["cell_id", "cellId"],
      ["current_operator_id", "currentOperatorId"],
      ["position_id", "positionId"],
      ["operator_id", "operatorId"],
      ["persona_id", "personaId"],
      ["environment_id", "environmentId"],
      ["operator_type", "operatorType"],
      ["assignment_id", "assignmentId"],
      ["skill_id", "skillId"],
      ["schedule_id", "scheduleId"],
      ["target_type", "targetType"],
      ["target_id", "targetId"],
      ["entity_type", "entityType"],
      ["entity_id", "entityId"],
      ["created_at", "createdAt"],
      ["updated_at", "updatedAt"],
      ["started_at", "startedAt"],
      ["ended_at", "endedAt"],
      ["lifecycle_status", "lifecycleStatus"],
      ["required", "required"],
    ];
    for (const [from, to] of aliases) {
      if (from in result) {
        result[to] = result[from];
        delete result[from];
      }
    }
    return result;
  }

  createFounderCompany(input: { name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("founder-company"), name: text(input.name, "Founder company name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_founder_companies(id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", record.id, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_founder_companies WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createBusiness(input: { founderCompanyId: string; name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    this.require("founder_companies", input.founderCompanyId, "Founder company");
    const record = { id: id("business"), founderCompanyId: input.founderCompanyId, name: text(input.name, "Business name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_businesses(id,founder_company_id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.founderCompanyId, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_businesses WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createWorkforce(input: { name: string; businessId?: string | null; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    if (input.businessId) this.require("businesses", input.businessId, "Business");
    const record = { id: id("workforce"), businessId: input.businessId ?? null, name: text(input.name, "Workforce name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_workforces(id,business_id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.businessId, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_workforces WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createCell(input: { workforceId: string; name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    const record = { id: id("cell"), workforceId: input.workforceId, name: text(input.name, "Cell name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_cells(id,workforce_id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.workforceId, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_cells WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createPosition(input: { workforceId: string; cellId?: string | null; title: string; purpose: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown>; currentOperatorId?: string | null }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    if (input.cellId) this.require("cells", input.cellId, "Cell");
    const record = { id: id("position"), workforceId: input.workforceId, cellId: input.cellId ?? null, title: text(input.title, "Position title"), purpose: text(input.purpose, "Position purpose"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), currentOperatorId: input.currentOperatorId ?? null, metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_positions(id,workforce_id,cell_id,title,purpose,lifecycle_status,current_operator_id,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", record.id, record.workforceId, record.cellId, record.title, record.purpose, record.lifecycleStatus, record.currentOperatorId, record.metadataJson, record.createdAt, record.updatedAt);
    return this.getPosition(record.id)!;
  }

  getPosition(positionId: string): Row | undefined {
    const row = this.db.get<Row>("SELECT * FROM canonical_positions WHERE id=?", positionId);
    return row ? this.hydrate(row) : undefined;
  }

  createOperator(input: { name: string; operatorType: unknown; lifecycleStatus?: LifecycleStatus; personaId?: string | null; metadata?: Record<string, unknown> }): Row {
    if (input.personaId) this.require("personas", input.personaId, "Persona");
    const record = { id: id("operator"), name: text(input.name, "Operator name"), operatorType: operatorType(input.operatorType), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), personaId: input.personaId ?? null, metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_operators(id,name,operator_type,lifecycle_status,persona_id,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.name, record.operatorType, record.lifecycleStatus, record.personaId, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_operators WHERE id=?", record.id);
    return row ? this.hydrate({ ...row, positionId: null }) : {};
  }

  createPersona(input: { name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("persona"), name: text(input.name, "Persona name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_personas(id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", record.id, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_personas WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  getPersona(personaId: string): Row | undefined {
    const row = this.db.get<Row>("SELECT * FROM canonical_personas WHERE id=?", personaId);
    return row ? this.hydrate(row) : undefined;
  }

  assignOperatorToPosition(input: { positionId: string; operatorId: string; status?: LifecycleStatus }): Row {
    this.require("positions", input.positionId, "Position");
    this.require("operators", input.operatorId, "Operator");
    const currentAssignment = this.db.get<Row>("SELECT * FROM canonical_position_assignments WHERE position_id=? AND lifecycle_status='active' ORDER BY created_at DESC LIMIT 1", input.positionId);
    if (currentAssignment && currentAssignment.operator_id !== input.operatorId) {
      this.db.run("UPDATE canonical_position_assignments SET lifecycle_status='ended',ended_at=?,updated_at=? WHERE id=?", now(), now(), currentAssignment.id);
      this.db.run("INSERT INTO canonical_position_assignments(id,position_id,operator_id,lifecycle_status,started_at,ended_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", id("assignment"), input.positionId, currentAssignment.operator_id, "ended", currentAssignment.started_at, now(), now(), now());
    }
    const record = { id: id("assignment"), positionId: input.positionId, operatorId: input.operatorId, lifecycleStatus: assignmentLifecycle(input.status), startedAt: now(), endedAt: null, createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_position_assignments(id,position_id,operator_id,lifecycle_status,started_at,ended_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.positionId, record.operatorId, record.lifecycleStatus, record.startedAt, record.endedAt, record.createdAt, record.updatedAt);
    this.db.run("UPDATE canonical_positions SET current_operator_id=?,updated_at=? WHERE id=?", record.operatorId, now(), input.positionId);
    const row = this.db.get<Row>("SELECT * FROM canonical_position_assignments WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  removeOperatorFromPosition(input: { positionId: string; operatorId: string }): Row {
    this.require("positions", input.positionId, "Position");
    this.require("operators", input.operatorId, "Operator");
    const assignment = this.db.get<Row>("SELECT * FROM canonical_position_assignments WHERE position_id=? AND operator_id=? AND lifecycle_status='active' ORDER BY created_at DESC LIMIT 1", input.positionId, input.operatorId);
    if (!assignment) throw new Error("Active assignment not found.");
    this.db.run("UPDATE canonical_position_assignments SET lifecycle_status='ended',ended_at=?,updated_at=? WHERE id=?", now(), now(), assignment.id);
    this.db.run("INSERT INTO canonical_position_assignments(id,position_id,operator_id,lifecycle_status,started_at,ended_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", id("assignment"), input.positionId, input.operatorId, "ended", assignment.started_at, now(), now(), now());
    this.db.run("UPDATE canonical_positions SET current_operator_id=NULL,updated_at=? WHERE id=?", now(), input.positionId);
    return this.getPosition(input.positionId)!;
  }

  listPositionAssignments(positionId: string): Row[] {
    return this.db.all<Row>("SELECT * FROM canonical_position_assignments WHERE position_id=? ORDER BY created_at", positionId);
  }

  createEnvironment(input: { name: string; kind?: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("environment"), name: text(input.name, "Environment name"), kind: text(input.kind ?? "local", "Environment kind"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_environments(id,name,kind,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.name, record.kind, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_environments WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createEnvironmentManager(input: { environmentId: string; name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    this.require("environments", input.environmentId, "Environment");
    const record = { id: id("manager"), environmentId: input.environmentId, name: text(input.name, "Environment manager name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_environment_managers(id,environment_id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.environmentId, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_environment_managers WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createSkill(input: { name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("skill"), name: text(input.name, "Skill name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_skills(id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", record.id, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_skills WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createDependency(input: { kind: string; key: string; label?: string; required?: boolean; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("dependency"), kind: text(input.kind, "Dependency kind"), key: text(input.key, "Dependency key"), label: input.label ? text(input.label, "Dependency label") : null, required: input.required === undefined ? 1 : input.required ? 1 : 0, metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_dependencies(id,kind,key,label,required,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.kind, record.key, record.label, record.required, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_dependencies WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createCapability(input: { key: string; label?: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("capability"), key: text(input.key, "Capability key"), label: input.label ? text(input.label, "Capability label") : null, lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_capabilities(id,key,label,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, record.key, record.label, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_capabilities WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createSession(input: { environmentId: string; ownerType: string; ownerId: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    this.require("environments", input.environmentId, "Environment");
    const record = { id: id("session"), environmentId: input.environmentId, ownerType: text(input.ownerType, "Session owner type"), ownerId: text(input.ownerId, "Session owner id"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_sessions(id,environment_id,owner_type,owner_id,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.environmentId, record.ownerType, record.ownerId, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_sessions WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createCredentialReference(input: { scope: string; location: string; content?: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    if (input.content && /secret|token|password|key/i.test(input.content)) throw new Error("Credential reference content must not contain raw secret material.");
    const record = { id: id("credential"), scope: text(input.scope, "Credential scope"), location: text(input.location, "Credential location"), content: input.content ? text(input.content, "Credential reference content") : null, lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_credential_references(id,scope,location,content,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.scope, record.location, record.content, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_credential_references WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createSchedule(input: { targetType: string; targetId: string; name: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("schedule"), targetType: text(input.targetType, "Schedule target type"), targetId: text(input.targetId, "Schedule target id"), name: text(input.name, "Schedule name"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_schedules(id,target_type,target_id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.targetType, record.targetId, record.name, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_schedules WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createExecution(input: { assignmentId: string; skillId?: string | null; scheduleId?: string | null; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    this.require("position_assignments", input.assignmentId, "Position assignment");
    if (input.skillId) this.require("skills", input.skillId, "Skill");
    if (input.scheduleId) this.require("schedules", input.scheduleId, "Schedule");
    const record = { id: id("execution"), assignmentId: input.assignmentId, skillId: input.skillId ?? null, scheduleId: input.scheduleId ?? null, lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_executions(id,assignment_id,skill_id,schedule_id,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.assignmentId, record.skillId, record.scheduleId, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_executions WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createApproval(input: { targetType: string; targetId: string; action: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("approval"), targetType: text(input.targetType, "Approval target type"), targetId: text(input.targetId, "Approval target id"), action: text(input.action, "Approval action"), lifecycleStatus: lifecycle(input.lifecycleStatus, "draft"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_approvals(id,target_type,target_id,action,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.targetType, record.targetId, record.action, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_approvals WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  createAuditEvent(input: { entityType: string; entityId: string; action: string; lifecycleStatus?: LifecycleStatus; metadata?: Record<string, unknown> }): Row {
    const record = { id: id("audit"), entityType: text(input.entityType, "Audit entity type"), entityId: text(input.entityId, "Audit entity id"), action: text(input.action, "Audit action"), lifecycleStatus: lifecycle(input.lifecycleStatus, "active"), metadataJson: json(object(input.metadata)), createdAt: now(), updatedAt: now() };
    this.db.run("INSERT INTO canonical_audit_events(id,entity_type,entity_id,action,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", record.id, record.entityType, record.entityId, record.action, record.lifecycleStatus, record.metadataJson, record.createdAt, record.updatedAt);
    const row = this.db.get<Row>("SELECT * FROM canonical_audit_events WHERE id=?", record.id);
    return row ? this.hydrate(row) : {};
  }

  validateWorkforcePackage(input: { packageId: string; schemaVersion: unknown; metadata: Record<string, unknown>; cells?: unknown[]; positions?: unknown[]; requiredSkills?: unknown[]; requiredCapabilities?: unknown[]; requiredDependencies?: unknown[]; routines?: unknown[]; compatibilityMetadata?: Record<string, unknown> }): { valid: boolean; warnings: string[]; normalized?: Record<string, unknown> } {
    const version = normalizePackageVersion(input.schemaVersion);
    const warnings: string[] = [];
    if (!text(input.packageId, "Package id")) throw new Error("Package id is required.");
    if (typeof input.metadata !== "object" || input.metadata === null || Array.isArray(input.metadata)) throw new Error("Workforce package metadata must be an object.");
    return { valid: true, warnings, normalized: { packageId: input.packageId, schemaVersion: version, metadata: input.metadata, cells: list(input.cells), positions: list(input.positions), requiredSkills: list(input.requiredSkills), requiredCapabilities: list(input.requiredCapabilities), requiredDependencies: list(input.requiredDependencies), routines: list(input.routines), compatibilityMetadata: object(input.compatibilityMetadata) } };
  }

  validateBusinessPackage(input: { packageId: string; schemaVersion: unknown; metadata: Record<string, unknown>; externalAccountReferences?: unknown[]; storageReferences?: unknown[]; knowledgeReferences?: unknown[]; policyReferences?: unknown[]; procedureReferences?: unknown[]; approvalRules?: unknown[]; credentialReferenceRequirements?: unknown[]; compatibilityMetadata?: Record<string, unknown> }): { valid: boolean; warnings: string[]; normalized?: Record<string, unknown> } {
    const version = normalizePackageVersion(input.schemaVersion);
    const warnings: string[] = [];
    if (!text(input.packageId, "Package id")) throw new Error("Package id is required.");
    if (typeof input.metadata !== "object" || input.metadata === null || Array.isArray(input.metadata)) throw new Error("Business package metadata must be an object.");
    return { valid: true, warnings, normalized: { packageId: input.packageId, schemaVersion: version, metadata: input.metadata, externalAccountReferences: list(input.externalAccountReferences), storageReferences: list(input.storageReferences), knowledgeReferences: list(input.knowledgeReferences), policyReferences: list(input.policyReferences), procedureReferences: list(input.procedureReferences), approvalRules: list(input.approvalRules), credentialReferenceRequirements: list(input.credentialReferenceRequirements), compatibilityMetadata: object(input.compatibilityMetadata) } };
  }

  mapLegacyActorToOperator(input: { id: string; name: string; role?: string; persona?: string; operatorKind?: unknown }): { operatorId?: string; name: string; operatorType: OperatorType; warnings: string[] } {
    const warnings: string[] = [];
    const operatorTypeValue = operatorType(input.operatorKind ?? (input.role === "manager" ? "ai" : "human"));
    return { operatorId: input.id, name: text(input.name, "Legacy actor name"), operatorType: operatorTypeValue, warnings };
  }

  mapLegacyManagerToEnvironmentManager(input: { id: string; name: string; fields?: Record<string, unknown> }): { managerId?: string; name: string; warnings: string[] } {
    const warnings = input.fields && input.fields.scope === "unclear" ? ["Ambiguous legacy manager scope; relationship requires explicit environment assignment."] : [];
    return { managerId: input.id, name: text(input.name, "Legacy manager name"), warnings };
  }

  private require(table: string, recordId: string, label: string): Row {
    const allowed = new Set(["founder_companies", "businesses", "workforces", "cells", "positions", "operators", "personas", "environments", "environment_managers", "skills", "dependencies", "capabilities", "sessions", "credential_references", "schedules", "executions", "approvals", "audit_events", "position_assignments", "canonical_founder_companies", "canonical_businesses", "canonical_workforces", "canonical_cells", "canonical_positions", "canonical_operators", "canonical_personas", "canonical_environments", "canonical_environment_managers", "canonical_skills", "canonical_dependencies", "canonical_capabilities", "canonical_sessions", "canonical_credential_references", "canonical_schedules", "canonical_executions", "canonical_approvals", "canonical_audit_events", "canonical_position_assignments"]);
    const canonicalTable = {
      founder_companies: "canonical_founder_companies",
      businesses: "canonical_businesses",
      workforces: "canonical_workforces",
      cells: "canonical_cells",
      positions: "canonical_positions",
      operators: "canonical_operators",
      personas: "canonical_personas",
      environments: "canonical_environments",
      environment_managers: "canonical_environment_managers",
      skills: "canonical_skills",
      dependencies: "canonical_dependencies",
      capabilities: "canonical_capabilities",
      sessions: "canonical_sessions",
      credential_references: "canonical_credential_references",
      schedules: "canonical_schedules",
      executions: "canonical_executions",
      approvals: "canonical_approvals",
      audit_events: "canonical_audit_events",
      position_assignments: "canonical_position_assignments"
    } as Record<string, string>;
    const tableName = canonicalTable[table] ?? table;
    const row = this.db.get<Row>(`SELECT * FROM ${tableName} WHERE id=?`, recordId);
    if (!allowed.has(table)) throw new Error("Unsupported canonical entity table.");
    if (!row) throw new Error(`${label} not found.`);
    return this.hydrate(row);
  }
}
