import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("L08b surfaces objectives, deadline, risk and next action before secondary panels", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const js = readFileSync(resolve("web/app.js"), "utf8");
  const css = readFileSync(resolve("web/styles.css"), "utf8");

  for (const id of [
    "mission-title","mission-state","mission-objective","mission-why",
    "mission-deadline","mission-risk","mission-action","mission-objectives"
  ]) {
    assert.match(html, new RegExp("id=\"" + id + "\""));
  }
  assert.match(js, /obs\.scenario\.objectives/);
  assert.match(js, /Période calme/);
  assert.match(js, /Aucune action urgente/);
  assert.match(css, /grid-template-areas:"mission mission mission"/);
});

test("L08b keeps visible operational terminology French", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const js = readFileSync(resolve("web/app.js"), "utf8");

  assert.doesNotMatch(html, />Planning court</);
  assert.doesNotMatch(html, />Inspector</);
  assert.match(html, /Interventions prévues/);
  assert.match(html, /Pilotage de la tranche/);
  assert.match(js, /"program-price":"programme et prix"/);
  assert.match(js, /"awaiting-return-check":"contrôle de retour requis"/);
  assert.doesNotMatch(js, /feedback\.code} —/);
  assert.doesNotMatch(js, /SAVE_JSON_INVALID —/);
});

test("L08b site view visually reuses the approved warm plant language", () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const css = readFileSync(resolve("web/styles.css"), "utf8");

  for (const token of [
    "site-cooling-tower","site-reactor-building","site-reactor-dome",
    "site-turbine-hall","site-grid-yard","site-network-flow"
  ]) {
    assert.match(app + css, new RegExp(token));
  }
  assert.match(css, /#ffd365/);
  assert.match(css, /#ffb134/);
  assert.match(css, /#e58a3c/);
});

test("L08b UI version is explicit without changing engine or save schema", async () => {
  const versions = await import("../src/contracts/versions.js");
  assert.equal(versions.UI_VERSION, "0.8.1-l08b");
  assert.equal(versions.ENGINE_VERSION, "0.7.0-l07");
  assert.equal(versions.SCHEMA_VERSION, 5);
});


test("L08b browser entrypoint is valid JavaScript syntax", () => {
  const result = spawnSync(process.execPath, ["--check", resolve("web/app.js")], {
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `web/app.js must parse before deployment:\n${result.stderr || result.stdout}`
  );
});
