import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { createPlayableServer } from "../src/playable/server.js";
import { PlayableSession } from "../src/playable/session.js";
import {
  MILESTONE_A_POLICIES,
  MILESTONE_A_SEEDS,
  MILESTONE_A_VARIANTS,
  MILESTONE_A_VERSION,
  milestonePolicyActions,
  milestoneVariantWorld,
  policyDominatesEveryVariant,
  runMilestoneAMatrix,
  runMilestoneASession
} from "../src/validation/milestoneA.js";
import { validateWorldState } from "../src/contracts/validation.js";

test("L08 exposes three reference policies, three start variants and exactly 30 seeds", () => {
  assert.equal(MILESTONE_A_VERSION, "0.8.0-l08");
  assert.deepEqual(MILESTONE_A_POLICIES, [
    "prudent",
    "productive",
    "maintenance-opportuniste"
  ]);
  assert.deepEqual(MILESTONE_A_VARIANTS, [
    "reference",
    "delivery-pressure",
    "maintenance-pressure"
  ]);
  assert.equal(MILESTONE_A_SEEDS.length, 30);
  assert.equal(new Set(MILESTONE_A_SEEDS).size, 30);
});

test("all L08 start variants are valid and remain explicitly fictitious Valmorne states", () => {
  for (const variant of MILESTONE_A_VARIANTS) {
    const world = milestoneVariantWorld(variant);
    assert.deepEqual(validateWorldState(world), { ok: true });
    assert.equal(world.scenario.id, "valmorne-24h-reference");
    assert.match(world.assets["plant-valmorne"]?.label ?? "", /fictive/i);
  }
});

test("reference policies consume PlayerObservation and produce deterministic intentions", () => {
  const session = new PlayableSession(808);
  const observation = session.state().observation;
  for (const policy of MILESTONE_A_POLICIES) {
    assert.deepEqual(
      milestonePolicyActions(policy, observation),
      milestonePolicyActions(policy, structuredClone(observation))
    );
  }
});

test("30-seed policy matrix completes 270 full 24h sessions without invalid state, lost command or unexplained cash", () => {
  const matrix = runMilestoneAMatrix();
  assert.equal(matrix.summary.sessions, 270);
  assert.equal(matrix.summary.seeds, 30);

  for (const result of matrix.results) {
    assert.equal(result.metrics.worldValid, true, `${result.policy}/${result.variant}/${result.seed}`);
    assert.equal(result.metrics.cashReconciles, true, `${result.policy}/${result.variant}/${result.seed}`);
    assert.equal(result.metrics.rejectedCommands, 0, `${result.policy}/${result.variant}/${result.seed}`);
    assert.equal(result.metrics.lostAcceptedCommands, 0, `${result.policy}/${result.variant}/${result.seed}`);
    assert.equal(result.metrics.debriefReady, true, `${result.policy}/${result.variant}/${result.seed}`);
    assert.equal(result.finalSave.payload.simTimeSec, 86_400);
    assert.ok(result.metrics.longestQuietWindowSec >= 3600);
    assert.ok(result.metrics.maxAlertGroupSize <= 3);
  }

  console.log("L08 matrix summary:", JSON.stringify(matrix.summary));
});

test("no single reference strategy Pareto-dominates every start variant", () => {
  const { results } = runMilestoneAMatrix();
  for (const policy of MILESTONE_A_POLICIES) {
    assert.equal(
      policyDominatesEveryVariant(policy, results),
      false,
      `${policy} unexpectedly dominates all variants`
    );
  }
});

test("save/reprise in the middle of a policy session preserves the exact final result", () => {
  for (const policy of MILESTONE_A_POLICIES) {
    for (const variant of MILESTONE_A_VARIANTS) {
      const seed = MILESTONE_A_SEEDS[7]!;
      const continuous = runMilestoneASession(policy, variant, seed);
      const resumed = runMilestoneASession(policy, variant, seed, { restoreAtSec: 43_200 });
      assert.deepEqual(resumed.metrics, continuous.metrics);
      assert.deepEqual(resumed.finalSave, continuous.finalSave);
      assert.deepEqual(resumed.decisions, continuous.decisions);
    }
  }
});

test("tutorial teaches MW, MWh and delivery commitment end-to-end without hidden engine state", () => {
  const html = readFileSync(resolve("web/index.html"), "utf8");
  const js = readFileSync(resolve("web/app.js"), "utf8");
  assert.match(html, /Tutoriel · 10 min/);
  assert.match(html, /Puissance.*MW/s);
  assert.match(html, /Énergie.*MWh/s);
  assert.match(html, /Engagement.*fenêtre/s);
  assert.match(js, /renderTutorial/);
  assert.match(js, /generatedMwh\.value/);
  assert.match(js, /commitments/);
  assert.doesNotMatch(js, /actualCondition|futureEvents|WorldState/);
});

test("local playable action HTTP p95 stays below 150 ms on the CI reference runner", async (t) => {
  const server = createPlayableServer(new PlayableSession(809));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const samples: number[] = [];

  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    const response = await fetch(`${base}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "advance", seconds: 1 })
    });
    assert.equal(response.status, 200);
    await response.json();
    samples.push(performance.now() - started);
  }

  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
  console.log(`L08 local HTTP action latency p95=${p95.toFixed(2)}ms`);
  assert.ok(p95 < 150, `p95 ${p95.toFixed(2)}ms >= 150ms`);
});

test("human validation artefacts reserve five real-player slots and never fabricate outcomes", () => {
  const protocol = readFileSync(resolve("docs/L08-HUMAN-PROTOCOL.md"), "utf8");
  const results = readFileSync(resolve("docs/L08-HUMAN-RESULTS.md"), "utf8");
  const milestone = readFileSync(resolve("docs/L08-MILESTONE-A.md"), "utf8");

  assert.match(protocol, /5 personnes réelles/);
  assert.match(protocol, /puissance.*énergie.*engagement/is);
  assert.match(protocol, /4\/5/);
  assert.match(protocol, /3 envies spontanées de rejouer/);
  assert.match(results, /P1.*NON EXÉCUTÉ/);
  assert.match(results, /P2.*NON EXÉCUTÉ/);
  assert.match(results, /P3.*NON EXÉCUTÉ/);
  assert.match(results, /P4.*NON EXÉCUTÉ/);
  assert.match(results, /P5.*NON EXÉCUTÉ/);
  assert.match(milestone, /décision.*EN ATTENTE/is);
  assert.match(milestone, /FPS.*NON MESURÉ/is);
});
