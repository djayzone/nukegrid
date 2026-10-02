import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONTRACT_VERSION, ENGINE_VERSION, UI_VERSION } from "../src/contracts/versions.js";
import { PlayableSession, parsePlayableIntent } from "../src/playable/session.js";
import { DeterministicEngine } from "../src/sim/engine.js";
import { valmorneWorld } from "../src/content/valmorne.js";

test("L06 observation/action contract remains versioned after later engine/UI lots", () => {
  assert.equal(CONTRACT_VERSION, 6);
  assert.ok(ENGINE_VERSION.startsWith("0."));
  assert.ok(UI_VERSION.startsWith("0."));
});

test("PlayerObservation exposes commercial commitments without UI access to WorldState", () => {
  const observation = new DeterministicEngine(valmorneWorld, 600).observation();
  assert.equal(observation.economy.commitments.length, 3);
  assert.equal(observation.economy.commitments[0]?.id, "delivery-valmorne-day-1");
  assert.equal(observation.economy.commitments[0]?.contractedMwh, 800);
  assert.equal(observation.economy.commitments[0]?.remainingExposureMwh, 800);
  assert.equal("actualCondition" in observation.maintenance.equipment["unit-valmorne-1:turbine"]!, false);
});

test("playable intent parser rejects malformed browser actions", () => {
  assert.equal(parsePlayableIntent({ type: "advance", seconds: -1 }), null);
  assert.equal(parsePlayableIntent({ type: "set-power", unitId: 42, powerMw: 10 }), null);
  assert.deepEqual(parsePlayableIntent({ type: "advance", seconds: 900.9 }), {
    type: "advance",
    seconds: 900
  });
});

test("every UI action returns explicit accepted or rejected feedback", () => {
  const session = new PlayableSession(601);
  const rejected = session.perform({
    type: "request-unit-state",
    unitId: "unit-valmorne-1",
    state: "producing"
  });
  assert.equal(rejected.feedback?.status, "rejected");
  assert.equal(rejected.feedback?.code, "COMMAND_TRANSITION_FORBIDDEN");

  const accepted = session.perform({
    type: "request-unit-state",
    unitId: "unit-valmorne-1",
    state: "start-preparation"
  });
  assert.equal(accepted.feedback?.status, "accepted");
});

test("production can be played from UI intentions without developer console", () => {
  const session = new PlayableSession(602);
  assert.equal(session.perform({
    type: "request-unit-state",
    unitId: "unit-valmorne-1",
    state: "start-preparation"
  }).feedback?.status, "accepted");
  session.perform({ type: "advance", seconds: 900 });
  assert.equal(session.perform({
    type: "request-unit-state",
    unitId: "unit-valmorne-1",
    state: "producing"
  }).feedback?.status, "accepted");
  session.perform({ type: "advance", seconds: 1800 });
  assert.equal(session.perform({
    type: "set-power",
    unitId: "unit-valmorne-1",
    powerMw: 450
  }).feedback?.status, "accepted");
  const after = session.perform({ type: "advance", seconds: 3600 });
  assert.ok(
    after.observation.visibleAssets["unit-valmorne-1"]!.productionUnit!.realizedNetPowerMw.value > 0
  );
});

test("costly replacement energy requires an explicit confirmation before cash moves", () => {
  const session = new PlayableSession(603);
  const before = session.state().observation.cashCents.value;
  const preview = session.perform({
    type: "buy-replacement",
    contractId: "delivery-valmorne-day-1",
    powerMw: 100,
    maxPriceEurPerMwh: 200
  });
  assert.equal(preview.feedback?.status, "confirmation-required");
  assert.equal(preview.observation.cashCents.value, before);

  const confirmed = session.perform({
    type: "buy-replacement",
    contractId: "delivery-valmorne-day-1",
    powerMw: 100,
    maxPriceEurPerMwh: 200,
    confirmed: true
  });
  assert.equal(confirmed.feedback?.status, "accepted");
  assert.ok(confirmed.observation.cashCents.value < before);
});

test("grouped scenario alerts are reachable through the playable observation", () => {
  const session = new PlayableSession(604);
  session.perform({ type: "advance", seconds: 21600 });
  const state = session.perform({ type: "advance", seconds: 300 });
  assert.ok(state.observation.scenario.alertGroups.length >= 1);
  assert.deepEqual(
    new Set(state.observation.scenario.alertGroups[0]?.incidentIds),
    new Set(["incident-vibration-v1", "incident-relief-delay"])
  );
});

test("24h playable debrief retains multiple precise causal consequences", () => {
  const session = new PlayableSession(605);
  for (let guard = 0; guard < 100 && session.state().observation.simTimeSec < 86400; guard += 1) {
    session.perform({ type: "advance", seconds: 3600 });
  }
  const debrief = session.state().observation.scenario.debrief;
  assert.ok(debrief?.ready);
  assert.ok(debrief.timeline.filter((row) => row.kind === "consequence").length >= 2);
  assert.ok(debrief.timeline.some((row) => row.kind === "reveal"));
});

test("web shell encodes keyboard, reduced-motion, non-audio alarm and 1366px layout contracts", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const css = readFileSync(resolve("web/styles.css"), "utf8");
  const js = readFileSync(resolve("web/app.js"), "utf8");

  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /Vue tabulaire équivalente/);
  assert.match(html, /id="time-toggle"/);
  assert.match(html, /data-time-speed="16"/);
  assert.match(html, /data-time-speed="32"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media\s*\(max-width:1450px\)/);
  assert.match(css, /focus-visible/);
  assert.match(js, /event\.key==="1"/);
  assert.match(js, /event\.code === "Space"/);
  assert.match(js, /acknowledged/);
  assert.match(js, /realizedNetPowerMw\.value > 1/);
  assert.match(js, /météo non modélisée/);
});

test("graphical client consumes only the playable state/action API", () => {
  const js = readFileSync(resolve("web/app.js"), "utf8");
  assert.match(js, /\/api\/state/);
  assert.match(js, /\/api\/action/);
  assert.doesNotMatch(js, /WorldState|futureEvents|actualCondition/);
});
