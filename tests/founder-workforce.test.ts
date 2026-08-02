import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AtlasDatabase } from "../src/db.js";

test("Founder Company and Workforce 1 bootstrap ready without a business assignment", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-founder-workforce-"));
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  const company = db.get<any>("SELECT * FROM companies WHERE id='company_founder'");
  const workforce = db.get<any>("SELECT * FROM workforces WHERE id='workforce_one'");
  assert.equal(company?.founder, "Jacob Yaghmoor");
  assert.equal(workforce?.status, "ready");
  assert.equal(db.all("SELECT * FROM workforce_business_assignments WHERE workforce_id='workforce_one'").length, 0);
  assert.equal(db.all("SELECT * FROM workforce_positions WHERE workforce_id='workforce_one'").length, 2);
  assert.equal(db.all("SELECT * FROM position_occupancies WHERE status='active'").length, 2);
  assert.equal(db.all("SELECT * FROM workforce_loadouts WHERE workforce_id='workforce_one'").length, 1);
  db.close();
});
