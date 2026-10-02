import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import type { WorldState } from "../src/contracts/world.js";
import {
  valmorneEveningDeliveryContract,
  valmorneWorld
} from "../src/content/valmorne.js";
import { DeterministicEngine } from "../src/sim/engine.js";

function scheduleRepair(atSec: number) {
  return command({
    ...baseCommandFields("cmd-l05-repair", "player-1", "unit-valmorne-1", atSec),
    type: "ScheduleMaintenance",
    payload: {
      taskId: "l05-repair-v1",
      kind: "repair",
      targetGroup: "turbine",
      startsAtSec: atSec,
      expectedDurationSec: 3600
    }
  });
}

test("Valmorne L05 defines a 24h session and exactly three initial incident families", () => {
  assert.equal(valmorneWorld.scenario.sessionEndSec, 86400);
  assert.equal(Object.keys(valmorneWorld.scenario.incidents).length, 3);
  assert.deepEqual(
    new Set(Object.values(valmorneWorld.scenario.incidents).map((incident) => incident.family)),
    new Set(["mechanical", "resource", "program-price"])
  );
});

test("hidden causes stay out of PlayerObservation until their reveal boundary", () => {
  const engine = new DeterministicEngine(valmorneWorld, 501);
  engine.advanceUntil(21900, { stopOnImportantEvent: false });
  const before = JSON.stringify(engine.observation());
  assert.doesNotMatch(before, /Usure progressive du palier turbine/);
  assert.doesNotMatch(before, /Retard logistique fictif/);

  engine.advanceUntil(39600, { stopOnImportantEvent: false });
  const after = JSON.stringify(engine.observation());
  assert.match(after, /Usure progressive du palier turbine/);
  assert.match(after, /Retard logistique fictif/);
});

test("incident precondition is mandatory and no signal is scripted when it is absent", () => {
  const item = valmorneWorld.maintenance.equipment["unit-valmorne-1:turbine"]!;
  const world: WorldState = {
    ...valmorneWorld,
    maintenance: {
      ...valmorneWorld.maintenance,
      equipment: {
        ...valmorneWorld.maintenance.equipment,
        [item.id]: {
          ...item,
          actualCondition: "healthy",
          estimatedCondition: "healthy"
        }
      }
    }
  };
  const engine = new DeterministicEngine(world, 502);
  engine.advanceUntil(21600, { stopOnImportantEvent: false });
  const incident = engine.worldState().scenario.incidents["incident-vibration-v1"]!;
  assert.equal(incident.status, "avoided");
  assert.equal(incident.avoidedBy, "precondition-not-met");
  assert.equal(
    engine.observation().recentEvents.some(
      (event) => event.type === "ScenarioSignal" && event.payload.incidentId === incident.id
    ),
    false
  );
});

test("narrative director groups near-simultaneous signals into one alert batch", () => {
  const engine = new DeterministicEngine(valmorneWorld, 503);
  engine.advanceUntil(21900, { stopOnImportantEvent: false });
  const observation = engine.observation();
  assert.equal(observation.scenario.alertGroups.length, 1);
  assert.deepEqual(
    new Set(observation.scenario.alertGroups[0]?.incidentIds),
    new Set(["incident-vibration-v1", "incident-relief-delay"])
  );
});

test("a relevant repair after the vibration signal prevents the scripted limitation", () => {
  const engine = new DeterministicEngine(valmorneWorld, 504);
  engine.advanceUntil(21600, { stopOnImportantEvent: false });

  assert.equal(engine.submit(scheduleRepair(21600)).status, "accepted");
  assert.equal(engine.submit(command({
    ...baseCommandFields("cmd-l05-team", "player-1", "team-valmorne-a", 21600),
    type: "AssignTeam",
    payload: { teamId: "team-valmorne-a", taskId: "l05-repair-v1" }
  })).status, "accepted");

  engine.advanceUntil(25200, { stopOnImportantEvent: false });
  assert.equal(engine.submit(command({
    ...baseCommandFields("cmd-l05-return", "player-1", "unit-valmorne-1", 25200),
    type: "CompleteMaintenanceReturnCheck",
    payload: { taskId: "l05-repair-v1" }
  })).status, "accepted");

  engine.advanceUntil(28800, { stopOnImportantEvent: false });
  const incident = engine.worldState().scenario.incidents["incident-vibration-v1"]!;
  assert.equal(incident.status, "avoided");
  assert.equal(incident.avoidedBy, "target-repaired-before-consequence");
  assert.equal(
    engine.observation().recentEvents.some(
      (event) => event.type === "ScenarioConsequence" && event.payload.incidentId === incident.id
    ),
    false
  );
});

test("reserving the scarce team before the resource consequence avoids its outage", () => {
  const engine = new DeterministicEngine(valmorneWorld, 505);
  engine.advanceUntil(21900, { stopOnImportantEvent: false });
  assert.equal(engine.submit(command({
    ...baseCommandFields("cmd-resource-task", "player-1", "unit-valmorne-1", 21900),
    type: "ScheduleMaintenance",
    payload: {
      taskId: "resource-protected-task",
      kind: "inspection",
      targetGroup: "generator",
      startsAtSec: 33000,
      expectedDurationSec: 600
    }
  })).status, "accepted");
  assert.equal(engine.submit(command({
    ...baseCommandFields("cmd-resource-team", "player-1", "team-valmorne-b", 21900),
    type: "AssignTeam",
    payload: { teamId: "team-valmorne-b", taskId: "resource-protected-task" }
  })).status, "accepted");
  engine.advanceUntil(32400, { stopOnImportantEvent: false });
  const incident = engine.worldState().scenario.incidents["incident-relief-delay"]!;
  assert.equal(incident.status, "avoided");
  assert.match(incident.avoidedBy ?? "", /team-reserved/);
});

test("covering the evening contract before the price spike avoids price exposure punishment", () => {
  const engine = new DeterministicEngine(valmorneWorld, 506);
  engine.advanceUntil(46800, { stopOnImportantEvent: false });
  const result = engine.submit(command({
    ...baseCommandFields("cmd-evening-cover", "player-1", "connection-valmorne", 46800),
    type: "BuyReplacementEnergy",
    payload: {
      contractId: valmorneEveningDeliveryContract.id,
      deliveryStartSec: valmorneEveningDeliveryContract.deliveryStartSec,
      deliveryEndSec: valmorneEveningDeliveryContract.deliveryEndSec,
      powerMw: 400,
      maxPriceEurPerMwh: 200
    }
  }));
  assert.equal(result.status, "accepted");
  engine.advanceUntil(54000, { stopOnImportantEvent: false });
  const incident = engine.worldState().scenario.incidents["incident-price-revision"]!;
  assert.equal(incident.status, "avoided");
  assert.equal(incident.avoidedBy, "evening-delivery-fully-covered-before-price-spike");
});

test("mechanical limitation carries a direct economic contract reference", () => {
  const engine = new DeterministicEngine(valmorneWorld, 507);
  engine.advanceUntil(28800, { stopOnImportantEvent: false });
  const card = engine.observation().scenario.incidentCards.find(
    (incident) => incident.id === "incident-vibration-v1"
  );
  assert.ok(card);
  assert.deepEqual(card.relatedReferenceIds, ["delivery-valmorne-midday"]);
});

test("same simulated duration yields the same incident draws and outcomes at different speeds", () => {
  const fast = new DeterministicEngine(valmorneWorld, 508);
  fast.advanceUntil(86400, { stopOnImportantEvent: false });

  const stepped = new DeterministicEngine(valmorneWorld, 508);
  for (let atSec = 3600; atSec <= 86400; atSec += 3600) {
    stepped.advanceUntil(atSec, { stopOnImportantEvent: false });
  }

  assert.deepEqual(stepped.worldState().scenario, fast.worldState().scenario);
  assert.deepEqual(stepped.worldState().economy, fast.worldState().economy);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(stepped.worldState().scenario.incidents)
        .map(([id, incident]) => [id, incident.deterministicRoll])
    ),
    Object.fromEntries(
      Object.entries(fast.worldState().scenario.incidents)
        .map(([id, incident]) => [id, incident.deterministicRoll])
    )
  );
});

test("24h debrief overlays causal signals, commands, consequences and finance", () => {
  const engine = new DeterministicEngine(valmorneWorld, 509);
  engine.submit(command({
    ...baseCommandFields("cmd-debrief-policy", "player-1", "plant-valmorne", 0),
    type: "SetDelegationPolicy",
    payload: { policyId: "manual", enabled: false, maxAutomaticSpendCents: 0 }
  }));
  engine.advanceUntil(86400, { stopOnImportantEvent: false });
  const debrief = engine.observation().scenario.debrief;
  assert.ok(debrief?.ready);
  assert.ok(debrief.timeline.some((entry) => entry.kind === "signal"));
  assert.ok(debrief.timeline.some((entry) => entry.kind === "command"));
  assert.ok(debrief.timeline.some((entry) => entry.kind === "consequence"));
  assert.ok(debrief.timeline.some((entry) => entry.kind === "finance"));
  assert.ok(debrief.timeline.some((entry) => entry.kind === "reveal"));
});
