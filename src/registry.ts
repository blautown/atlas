import type { AtlasDatabase } from "./db.js";
import { id, json, now, parseJson } from "./util.js";

type Row = Record<string, any>;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export class RegistryService {
  constructor(readonly db: AtlasDatabase) {}

  available(): boolean {
    return Boolean(this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='workforces'"));
  }

  createCompany(input: { name: string; founder?: string; status?: string }): Row {
    const record = { id: id("company"), name: text(input.name, "Company name"), founder: input.founder?.trim() || null, status: input.status ?? "active", createdAt: now() };
    this.db.run("INSERT INTO companies(id,name,founder,status,created_at,updated_at) VALUES(?,?,?,?,?,?)", record.id, record.name, record.founder, record.status, record.createdAt, record.createdAt);
    return this.db.get<Row>("SELECT * FROM companies WHERE id=?", record.id)!;
  }

  createBusiness(input: { companyId: string; name: string; purpose?: string; status?: string }): Row {
    this.require("companies", input.companyId, "Company");
    const record = { id: id("business"), name: text(input.name, "Business name"), createdAt: now() };
    this.db.run("INSERT INTO businesses(id,company_id,name,purpose,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, input.companyId, record.name, input.purpose?.trim() ?? "", input.status ?? "planning", record.createdAt, record.createdAt);
    return this.db.get<Row>("SELECT * FROM businesses WHERE id=?", record.id)!;
  }

  createWorkforce(input: { companyId: string; name: string; purpose: string; status?: string }): Row {
    this.require("companies", input.companyId, "Company");
    const record = { id: id("workforce"), name: text(input.name, "Workforce name"), purpose: text(input.purpose, "Workforce purpose"), createdAt: now() };
    this.db.run("INSERT INTO workforces(id,company_id,name,purpose,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, input.companyId, record.name, record.purpose, input.status ?? "forming", record.createdAt, record.createdAt);
    return this.db.get<Row>("SELECT * FROM workforces WHERE id=?", record.id)!;
  }

  assignBusiness(input: { workforceId: string; businessId: string; mandate: string; activate?: boolean }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    this.require("businesses", input.businessId, "Business");
    if (input.activate && this.db.get("SELECT id FROM workforce_business_assignments WHERE workforce_id=? AND status='active'", input.workforceId)) throw new Error("Workforce already has an active business assignment.");
    const record = { id: id("assignment"), createdAt: now(), status: input.activate ? "active" : "proposed" };
    this.db.transaction(() => {
      this.db.run("INSERT INTO workforce_business_assignments(id,workforce_id,business_id,mandate,status,started_at,created_at) VALUES(?,?,?,?,?,?,?)", record.id, input.workforceId, input.businessId, text(input.mandate, "Assignment mandate"), record.status, input.activate ? record.createdAt : null, record.createdAt);
      if (input.activate) this.db.run("UPDATE workforces SET status='assigned',updated_at=? WHERE id=?", record.createdAt, input.workforceId);
    });
    return this.db.get<Row>("SELECT * FROM workforce_business_assignments WHERE id=?", record.id)!;
  }

  createCell(input: { workforceId: string; name: string; purpose: string }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    const record = { id: id("cell"), createdAt: now() };
    this.db.run("INSERT INTO workforce_cells(id,workforce_id,name,purpose,created_at) VALUES(?,?,?,?,?)", record.id, input.workforceId, text(input.name, "Cell name"), text(input.purpose, "Cell purpose"), record.createdAt);
    return this.db.get<Row>("SELECT * FROM workforce_cells WHERE id=?", record.id)!;
  }

  createPosition(input: { workforceId: string; cellId?: string; title: string; purpose: string; positionKind?: string; permittedOperatorKinds?: string[]; identityRequirement?: string; capabilityRequirements?: unknown[]; authorityPolicy?: unknown }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    if (input.cellId) {
      const cell = this.db.get<Row>("SELECT * FROM workforce_cells WHERE id=?", input.cellId);
      if (!cell || cell.workforce_id !== input.workforceId) throw new Error("Cell must belong to the same workforce.");
    }
    const record = { id: id("position"), createdAt: now() };
    this.db.run(`INSERT INTO workforce_positions(id,workforce_id,cell_id,title,purpose,position_kind,permitted_operator_kinds_json,identity_requirement,capability_requirements_json,authority_policy_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, record.id, input.workforceId, input.cellId ?? null, text(input.title, "Position title"), text(input.purpose, "Position purpose"), input.positionKind ?? "operational", json(input.permittedOperatorKinds ?? ["human", "ai"]), input.identityRequirement ?? "none", json(input.capabilityRequirements ?? []), json(input.authorityPolicy ?? {}), record.createdAt, record.createdAt);
    return this.position(record.id);
  }

  createOperator(input: { name: string; operatorKind: string; capabilityProfile?: unknown; runtimeConfig?: unknown }): Row {
    const record = { id: id("operator"), createdAt: now() };
    this.db.run("INSERT INTO workforce_operators(id,name,operator_kind,capability_profile_json,runtime_config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, text(input.name, "Operator name"), input.operatorKind, json(input.capabilityProfile ?? {}), json(input.runtimeConfig ?? {}), record.createdAt, record.createdAt);
    return this.operator(record.id);
  }

  occupy(input: { positionId: string; operatorId: string; authorityGrant?: unknown }): Row {
    const position = this.require("workforce_positions", input.positionId, "Position");
    const operator = this.require("workforce_operators", input.operatorId, "Operator");
    const permitted = parseJson<string[]>(position.permitted_operator_kinds_json);
    if (!permitted.includes(operator.operator_kind)) throw new Error(`Position does not permit ${operator.operator_kind} operators.`);
    if (this.db.get("SELECT id FROM position_occupancies WHERE position_id=? AND status='active'", input.positionId)) throw new Error("Position is already occupied.");
    const record = { id: id("occupancy"), startedAt: now() };
    this.db.transaction(() => {
      this.db.run("INSERT INTO position_occupancies(id,position_id,operator_id,authority_grant_json,started_at) VALUES(?,?,?,?,?)", record.id, input.positionId, input.operatorId, json(input.authorityGrant ?? {}), record.startedAt);
      this.db.run("UPDATE workforce_positions SET status='occupied',updated_at=? WHERE id=?", record.startedAt, input.positionId);
      this.db.run("UPDATE workforce_operators SET status='assigned',updated_at=? WHERE id=?", record.startedAt, input.operatorId);
    });
    return this.db.get<Row>("SELECT * FROM position_occupancies WHERE id=?", record.id)!;
  }

  createLoadout(input: { companyId: string; name: string; purpose: string; version?: number; components?: unknown[]; resourceRequirements?: unknown; status?: string }): Row {
    this.require("companies", input.companyId, "Company");
    const record = { id: id("loadout"), createdAt: now() };
    this.db.run("INSERT INTO loadouts(id,company_id,name,version,purpose,components_json,resource_requirements_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", record.id, input.companyId, text(input.name, "Loadout name"), input.version ?? 1, text(input.purpose, "Loadout purpose"), json(input.components ?? []), json(input.resourceRequirements ?? {}), input.status ?? "draft", record.createdAt, record.createdAt);
    return this.db.get<Row>("SELECT * FROM loadouts WHERE id=?", record.id)!;
  }

  attachLoadout(workforceId: string, loadoutId: string): Row {
    this.require("workforces", workforceId, "Workforce");
    this.require("loadouts", loadoutId, "Loadout");
    this.db.run("INSERT INTO workforce_loadouts(workforce_id,loadout_id,attached_at) VALUES(?,?,?)", workforceId, loadoutId, now());
    return this.db.get<Row>("SELECT * FROM workforce_loadouts WHERE workforce_id=? AND loadout_id=?", workforceId, loadoutId)!;
  }

  deploy(input: { workforceId: string; environmentId: string; status?: string; readiness?: unknown }): Row {
    this.require("workforces", input.workforceId, "Workforce");
    this.require("environments", input.environmentId, "Environment");
    if (this.db.get("SELECT id FROM workforce_deployments WHERE workforce_id=? AND retired_at IS NULL", input.workforceId)) throw new Error("Workforce already has an active deployment.");
    const record = { id: id("workforce_deployment"), createdAt: now() };
    this.db.run("INSERT INTO workforce_deployments(id,workforce_id,environment_id,status,readiness_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", record.id, input.workforceId, input.environmentId, input.status ?? "planning", json(input.readiness ?? {}), record.createdAt, record.createdAt);
    return this.db.get<Row>("SELECT * FROM workforce_deployments WHERE id=?", record.id)!;
  }

  state(): Record<string, unknown> {
    if (!this.available()) return { companies: [], businesses: [], workforces: [], assignments: [], cells: [], positions: [], operators: [], occupancies: [], loadouts: [], workforceLoadouts: [], deployments: [] };
    const decode = (rows: Row[], fields: string[]) => rows.map((row) => {
      const result = { ...row };
      for (const field of fields) if (field in result) { result[field.replace(/_json$/, "")] = parseJson(result[field]); delete result[field]; }
      return result;
    });
    return {
      companies: this.db.all("SELECT * FROM companies ORDER BY created_at"),
      businesses: this.db.all("SELECT * FROM businesses ORDER BY created_at"),
      workforces: this.db.all("SELECT * FROM workforces ORDER BY created_at"),
      assignments: this.db.all("SELECT * FROM workforce_business_assignments ORDER BY created_at"),
      cells: this.db.all("SELECT * FROM workforce_cells ORDER BY created_at"),
      positions: decode(this.db.all<Row>("SELECT * FROM workforce_positions ORDER BY created_at"), ["permitted_operator_kinds_json", "capability_requirements_json", "authority_policy_json"]),
      operators: decode(this.db.all<Row>("SELECT * FROM workforce_operators ORDER BY created_at"), ["capability_profile_json", "runtime_config_json"]),
      occupancies: decode(this.db.all<Row>("SELECT * FROM position_occupancies ORDER BY started_at"), ["authority_grant_json"]),
      loadouts: decode(this.db.all<Row>("SELECT * FROM loadouts ORDER BY created_at"), ["components_json", "resource_requirements_json"]),
      workforceLoadouts: this.db.all("SELECT * FROM workforce_loadouts ORDER BY attached_at"),
      deployments: decode(this.db.all<Row>("SELECT * FROM workforce_deployments ORDER BY created_at"), ["readiness_json"])
    };
  }

  private position(positionId: string): Row {
    const row = this.db.get<Row>("SELECT * FROM workforce_positions WHERE id=?", positionId)!;
    return { ...row, permitted_operator_kinds: parseJson(row.permitted_operator_kinds_json), capability_requirements: parseJson(row.capability_requirements_json), authority_policy: parseJson(row.authority_policy_json) };
  }

  private operator(operatorId: string): Row {
    const row = this.db.get<Row>("SELECT * FROM workforce_operators WHERE id=?", operatorId)!;
    return { ...row, capability_profile: parseJson(row.capability_profile_json), runtime_config: parseJson(row.runtime_config_json) };
  }

  private require(table: string, recordId: string, label: string): Row {
    const allowed = new Set(["companies", "businesses", "workforces", "workforce_cells", "workforce_positions", "workforce_operators", "loadouts", "environments"]);
    if (!allowed.has(table)) throw new Error("Invalid registry table.");
    const row = this.db.get<Row>(`SELECT * FROM ${table} WHERE id=?`, recordId);
    if (!row) throw new Error(`${label} not found.`);
    return row;
  }
}
