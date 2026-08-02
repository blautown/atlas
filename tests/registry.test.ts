import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AtlasDatabase } from "../src/db.js";
import { RegistryService } from "../src/registry.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-registry-"));
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  return { db, registry: new RegistryService(db) };
}

test("workforce exists before and independently of a business assignment", async () => {
  const { db, registry } = await fixture();
  const company = registry.createCompany({ name: "Founder Company", founder: "Jacob Yaghmoor" });
  const workforce = registry.createWorkforce({ companyId: company.id, name: "Workforce 1", purpose: "Ready operational capacity", status: "ready" });
  assert.equal(registry.state().assignments instanceof Array && (registry.state().assignments as unknown[]).length, 0);
  const business = registry.createBusiness({ companyId: company.id, name: "PBSIQ", purpose: "PBSIQ venture" });
  const assignment = registry.assignBusiness({ workforceId: workforce.id, businessId: business.id, mandate: "Maintain and progressively improve PBSIQ", activate: true });
  assert.equal(assignment.workforce_id, workforce.id);
  assert.equal(assignment.business_id, business.id);
  const workforceColumns = db.all<any>("PRAGMA table_info(workforces)").map((column) => column.name);
  assert.equal(workforceColumns.includes("business_id"), false);
  db.close();
});

test("positions remain stable while operators occupy them separately", async () => {
  const { db, registry } = await fixture();
  const company = registry.createCompany({ name: "Founder Company" });
  const workforce = registry.createWorkforce({ companyId: company.id, name: "Workforce 1", purpose: "Ready operational capacity" });
  const cell = registry.createCell({ workforceId: workforce.id, name: "Operations Cell", purpose: "Accept and perform assigned work" });
  const position = registry.createPosition({ workforceId: workforce.id, cellId: cell.id, title: "Maintainer", purpose: "Maintain assigned projects", permittedOperatorKinds: ["human", "ai"], identityRequirement: "none" });
  const operator = registry.createOperator({ name: "Local AI Operator", operatorKind: "ai", capabilityProfile: { coding: true } });
  const occupancy = registry.occupy({ positionId: position.id, operatorId: operator.id, authorityGrant: { branchWrites: true, production: false } });
  assert.equal(occupancy.position_id, position.id);
  assert.equal(occupancy.operator_id, operator.id);
  assert.equal(db.get<any>("SELECT status FROM workforce_positions WHERE id=?", position.id)?.status, "occupied");
  assert.throws(() => registry.occupy({ positionId: position.id, operatorId: operator.id }), /already occupied/);
  db.close();
});

test("loadout and deployment attach to workforce without business ownership", async () => {
  const { db, registry } = await fixture();
  const company = registry.createCompany({ name: "Founder Company" });
  const workforce = registry.createWorkforce({ companyId: company.id, name: "Workforce 1", purpose: "Ready operational capacity" });
  const loadout = registry.createLoadout({ companyId: company.id, name: "Local Software Work", purpose: "Operate software projects", status: "ready", components: [{ key: "repository", required: true }] });
  registry.attachLoadout(workforce.id, loadout.id);
  const timestamp = new Date().toISOString();
  db.run("INSERT INTO environments(id,name,kind,status,capabilities_json,health_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", "env-local", "Laptop", "local", "online", "{}", "{}", timestamp, timestamp);
  const deployment = registry.deploy({ workforceId: workforce.id, environmentId: "env-local", status: "sandboxed", readiness: { businessAssignmentRequired: false } });
  assert.equal(deployment.workforce_id, workforce.id);
  assert.equal(deployment.environment_id, "env-local");
  db.close();
});
