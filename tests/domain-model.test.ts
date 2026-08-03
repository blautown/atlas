import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AtlasDatabase } from "../src/db.js";
import { CanonicalDomainService } from "../src/domain.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-domain-"));
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  return { db, domain: new CanonicalDomainService(db) };
}

test("a Position can exist without an Operator", async () => {
  const { db, domain } = await fixture();
  const company = domain.createFounderCompany({ name: "Example Company" });
  domain.createBusiness({ founderCompanyId: company.id, name: "Example Business" });
  const workforce = domain.createWorkforce({ name: "test-workforce", metadata: { neutral: true } });
  const cell = domain.createCell({ workforceId: workforce.id, name: "Cell A" });
  const position = domain.createPosition({ workforceId: workforce.id, cellId: cell.id, title: "position-alpha", purpose: "Example position" });
  assert.equal(position.currentOperatorId, null);
  assert.equal(position.lifecycleStatus, "draft");
  db.close();
});

test("an Operator can exist without a Position", async () => {
  const { db, domain } = await fixture();
  const operator = domain.createOperator({ name: "operator-alpha", operatorType: "ai", lifecycleStatus: "active" });
  assert.equal(operator.positionId, null);
  db.close();
});

test("an Operator can be assigned to and removed from a Position without redefining the Position", async () => {
  const { db, domain } = await fixture();
  const workforce = domain.createWorkforce({ name: "test-workforce", metadata: { neutral: true } });
  const cell = domain.createCell({ workforceId: workforce.id, name: "Cell A" });
  const position = domain.createPosition({ workforceId: workforce.id, cellId: cell.id, title: "position-alpha", purpose: "Example position" });
  const operator = domain.createOperator({ name: "operator-alpha", operatorType: "ai" });
  const assignment = domain.assignOperatorToPosition({ positionId: position.id, operatorId: operator.id, status: "active" });
  assert.equal(assignment.positionId, position.id);
  const updatedPosition = domain.getPosition(position.id);
  assert.equal(updatedPosition?.currentOperatorId, operator.id);
  const removed = domain.removeOperatorFromPosition({ positionId: position.id, operatorId: operator.id });
  assert.equal(removed.currentOperatorId, null);
  const history = domain.listPositionAssignments(position.id);
  assert.equal(history.length, 2);
  db.close();
});

test("Position assignment history is preserved", async () => {
  const { db, domain } = await fixture();
  const workforce = domain.createWorkforce({ name: "test-workforce", metadata: { neutral: true } });
  const cell = domain.createCell({ workforceId: workforce.id, name: "Cell A" });
  const position = domain.createPosition({ workforceId: workforce.id, cellId: cell.id, title: "position-alpha", purpose: "Example position" });
  const operatorA = domain.createOperator({ name: "operator-alpha", operatorType: "ai" });
  const operatorB = domain.createOperator({ name: "operator-beta", operatorType: "human" });
  domain.assignOperatorToPosition({ positionId: position.id, operatorId: operatorA.id, status: "active" });
  domain.removeOperatorFromPosition({ positionId: position.id, operatorId: operatorA.id });
  domain.assignOperatorToPosition({ positionId: position.id, operatorId: operatorB.id, status: "active" });
  const history = domain.listPositionAssignments(position.id);
  assert.equal(history.length, 3);
  db.close();
});

test("Persona remains separate from Operator and Position", async () => {
  const { db, domain } = await fixture();
  const persona = domain.createPersona({ name: "persona-alpha" });
  const operator = domain.createOperator({ name: "operator-alpha", operatorType: "hybrid", personaId: persona.id });
  assert.equal(operator.personaId, persona.id);
  const position = domain.createPosition({ workforceId: domain.createWorkforce({ name: "test-workforce" }).id, title: "position-alpha", purpose: "Example position" });
  assert.equal(position.currentOperatorId, null);
  const storedPersona = domain.getPersona(persona.id);
  assert.equal(storedPersona?.name, "persona-alpha");
  db.close();
});

test("a Workforce can register without a Business", async () => {
  const { db, domain } = await fixture();
  const workforce = domain.createWorkforce({ name: "test-workforce" });
  assert.equal(workforce.businessId, null);
  db.close();
});

test("a Business can register without a Workforce", async () => {
  const { db, domain } = await fixture();
  const company = domain.createFounderCompany({ name: "Example Company" });
  const business = domain.createBusiness({ founderCompanyId: company.id, name: "example-business" });
  assert.equal(business.founderCompanyId, company.id);
  db.close();
});

test("Workforce Package validation accepts a neutral valid package", async () => {
  const { db, domain } = await fixture();
  const result = domain.validateWorkforcePackage({
    packageId: "pkg-workforce-neutral",
    schemaVersion: "1.0.0",
    metadata: { name: "test-workforce" },
    cells: [{ id: "cell-alpha", name: "Cell A" }],
    positions: [{ id: "position-alpha", title: "position-alpha" }],
    requiredSkills: [{ id: "skill-alpha", name: "Skill A" }]
  });
  assert.equal(result.valid, true);
  db.close();
});

test("Business Package validation accepts a neutral valid package", async () => {
  const { db, domain } = await fixture();
  const result = domain.validateBusinessPackage({
    packageId: "pkg-business-neutral",
    schemaVersion: "1.0.0",
    metadata: { name: "example-business" },
    externalAccountReferences: [{ id: "account-alpha", kind: "crm" }]
  });
  assert.equal(result.valid, true);
  db.close();
});

test("invalid package schema versions are rejected", async () => {
  const { db, domain } = await fixture();
  assert.throws(() => domain.validateWorkforcePackage({ packageId: "pkg-invalid", schemaVersion: "bad-version", metadata: { name: "test-workforce" } }), /schema version/);
  db.close();
});

test("raw credential secret values are rejected", async () => {
  const { db, domain } = await fixture();
  assert.throws(() => domain.createCredentialReference({ scope: "environment", location: "api-key", content: "super-secret-value" }), /Credential reference content/);
  db.close();
});

test("duplicate IDs are rejected by the backing store", async () => {
  const { db, domain } = await fixture();
  const company = domain.createFounderCompany({ name: "Duplicate Company" });
  assert.throws(() => db.run("INSERT INTO canonical_founder_companies(id,name,lifecycle_status,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", company.id, "Second", "active", "{}", new Date().toISOString(), new Date().toISOString()), /UNIQUE/i);
  db.close();
});

test("invalid operator types are rejected", async () => {
  const { db, domain } = await fixture();
  assert.throws(() => domain.createOperator({ name: "bad-operator", operatorType: "invalid" }), /Invalid operator type/);
  db.close();
});

test("invalid assignment state is rejected", async () => {
  const { db, domain } = await fixture();
  const workforce = domain.createWorkforce({ name: "test-workforce" });
  const cell = domain.createCell({ workforceId: workforce.id, name: "Cell A" });
  const position = domain.createPosition({ workforceId: workforce.id, cellId: cell.id, title: "position-alpha", purpose: "Example position" });
  const operator = domain.createOperator({ name: "operator-alpha", operatorType: "ai" });
  assert.throws(() => domain.assignOperatorToPosition({ positionId: position.id, operatorId: operator.id, status: "not-a-status" as any }), /Invalid assignment state/);
  db.close();
});

test("legacy actor mapping produces a canonical Operator-compatible result", async () => {
  const { db, domain } = await fixture();
  const result = domain.mapLegacyActorToOperator({ id: "legacy-actor", name: "Legacy Actor", role: "operator", persona: "friendly", operatorKind: "ai" });
  assert.equal(result.operatorType, "ai");
  assert.equal(result.name, "Legacy Actor");
  assert.equal(result.warnings.length, 0);
  db.close();
});

test("ambiguous legacy mapping produces an explicit warning", async () => {
  const { db, domain } = await fixture();
  const result = domain.mapLegacyManagerToEnvironmentManager({ id: "legacy-manager", name: "Legacy Manager", fields: { scope: "unclear" } });
  assert.equal(result.warnings.length, 1);
  db.close();
});
