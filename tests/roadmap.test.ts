import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("roadmap places model tiering and Actor V1 foundation between M5 and M6", async () => {
  const roadmap = JSON.parse(await readFile("config/roadmap.json", "utf8"));
  const ids = roadmap.milestones.map((milestone: { id: string }) => milestone.id);
  const tiering = roadmap.milestones.find((milestone: { id: string }) => milestone.id === "M5.5");

  assert.equal(ids.indexOf("M5.5"), ids.indexOf("M5") + 1);
  assert.equal(ids.indexOf("V1-ACTORS"), ids.indexOf("M5.5") + 1);
  assert.equal(ids.indexOf("M6"), ids.indexOf("V1-ACTORS") + 1);
  assert.ok(roadmap.operatingPrinciples.some((principle: string) =>
    principle.includes("Model capability is treated as a first-class constraint")
  ));
  assert.equal(tiering.status, "planned");
  assert.ok(tiering.acceptance.some((criterion: string) => criterion.includes("audit records")));
  const actors = roadmap.milestones.find((milestone: { id: string }) => milestone.id === "V1-ACTORS");
  assert.ok(actors.acceptance.some((criterion: string) => criterion.includes("24 hours")));

  const development = roadmap.milestones.find((milestone: { id: string }) => milestone.id === "M6");
  assert.ok(development.acceptance.some((criterion: string) => criterion.includes("Coding model tier")));

  const production = roadmap.milestones.find((milestone: { id: string }) => milestone.id === "M9");
  assert.ok(production.deliverables.length >= 6, "M9 must not be truncated by roadmap updates");
  assert.ok(production.acceptance.length >= 3, "M9 acceptance criteria must be preserved");
});
