import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PlayableSession } from "../src/playable/session.js";

function advancePast(session: PlayableSession, targetSec: number): void {
  for (let guard = 0; guard < 250 && session.state().observation.simTimeSec < targetSec; guard += 1) {
    session.perform({ type: "advance", seconds: 3600 });
  }
  assert.ok(
    session.state().observation.simTimeSec >= targetSec,
    `simulation stopped at ${session.state().observation.simTimeSec}s before ${targetSec}s`
  );
}

test("playable session crosses the historical 24h boundary into day 2", () => {
  const session = new PlayableSession(901);
  advancePast(session, 90_000);

  const observation = session.state().observation;
  assert.ok(observation.simTimeSec > 86_400);
  assert.equal(observation.scenario.debrief?.ready, true);
});

test("production continues accumulating after the J1 debrief boundary", () => {
  const session = new PlayableSession(902);
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

  advancePast(session, 86_400);
  const atMidnight = session.state().observation;
  const beforeMwh = atMidnight.visibleAssets["unit-valmorne-1"]!.productionUnit!.generatedMwh.value;

  advancePast(session, atMidnight.simTimeSec + 3600);
  const dayTwo = session.state().observation;
  const afterMwh = dayTwo.visibleAssets["unit-valmorne-1"]!.productionUnit!.generatedMwh.value;

  assert.ok(dayTwo.simTimeSec > 86_400);
  assert.ok(afterMwh > beforeMwh, `production did not continue: ${beforeMwh} -> ${afterMwh}`);
  assert.equal(dayTwo.scenario.debrief?.ready, true);
});

test("web realtime client no longer stops or previews at 86400 seconds", () => {
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const session = readFileSync(resolve("src/playable/session.ts"), "utf8");

  assert.doesNotMatch(app, /simTimeSec\s*>=\s*86400/);
  assert.doesNotMatch(app, /Math\.min\(\s*86400/);
  assert.doesNotMatch(session, /Math\.min\(86400/);
  assert.match(app, /formatSimulationClock/);
  assert.match(app, /pauseAndFlush/);
});
