import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import { PRODUCTION_GROUP_KINDS, type ProductionUnitState } from "../src/contracts/production.js";
import type { WorldState } from "../src/contracts/world.js";
import { valmorneWorld } from "../src/content/valmorne.js";
import { DeterministicEngine } from "../src/sim/engine.js";

function withUnit(
  world: WorldState,
  id: string,
  patch: Partial<ProductionUnitState>
): WorldState {
  const asset = world.assets[id];
  assert.ok(asset?.productionUnit);
  return {
    ...world,
    assets: {
      ...world.assets,
      [id]: {
        ...asset,
        productionUnit: {
          ...asset.productionUnit,
          ...patch
        }
      }
    }
  };
}

test("Valmorne exposes two production units with four functional groups each", () => {
  const units = Object.values(valmorneWorld.assets)
    .filter((asset) => asset.kind === "production-unit");
  assert.equal(units.length, 2);
  for (const asset of units) {
    assert.ok(asset.productionUnit);
    assert.deepEqual(Object.keys(asset.productionUnit.groups).sort(), [...PRODUCTION_GROUP_KINDS].sort());
  }
});

test("stopped state suppresses production", () => {
  const engine = new DeterministicEngine(valmorneWorld, 201);
  engine.advanceUntil(3600, { stopOnImportantEvent: false });
  const unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.ok(unit);
  assert.equal(unit.operatingState, "stopped");
  assert.equal(unit.realizedNetPowerMw, 0);
  assert.equal(unit.generatedMwh, 0);
});

test("setpoint above available capacity is rejected with an actionable alternative", () => {
  const world = withUnit(valmorneWorld, "unit-valmorne-1", {
    operatingState: "producing",
    plannedNetPowerMw: 400,
    realizedNetPowerMw: 400
  });
  const engine = new DeterministicEngine(world, 202);
  const result = engine.submit(command({
    ...baseCommandFields("cmd-too-high", "player-1", "unit-valmorne-1", 0),
    type: "SetPowerSchedule",
    payload: { points: [{ atSec: 0, netPowerMw: 950 }] }
  }));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "COMMAND_POWER_UNAVAILABLE");
    assert.equal(result.parameters.alternativeNetPowerMw, 900);
  }
});

test("ramps constrain realized power and energy is integrated from realized MW", () => {
  const world = withUnit(valmorneWorld, "unit-valmorne-1", {
    operatingState: "producing",
    plannedNetPowerMw: 100,
    realizedNetPowerMw: 100,
    rampUpMwPerHour: 50,
    rampDownMwPerHour: 50,
    generatedMwh: 0
  });
  const engine = new DeterministicEngine(world, 203);
  const result = engine.submit(command({
    ...baseCommandFields("cmd-ramp", "player-1", "unit-valmorne-1", 0),
    type: "SetPowerSchedule",
    payload: { points: [{ atSec: 0, netPowerMw: 200 }] }
  }));
  assert.equal(result.status, "accepted");
  engine.advanceUntil(3600, { stopOnImportantEvent: false });
  const unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.ok(unit);
  assert.equal(unit.realizedNetPowerMw, 150);
  assert.equal(unit.generatedMwh, 125);
});

test("forbidden transitions reject with the next legal state and valid transitions keep duration", () => {
  const engine = new DeterministicEngine(valmorneWorld, 204);
  const forbidden = engine.submit(command({
    ...baseCommandFields("cmd-direct-produce", "player-1", "unit-valmorne-1", 0),
    type: "RequestUnitState",
    payload: { state: "producing" }
  }));
  assert.equal(forbidden.status, "rejected");
  if (forbidden.status === "rejected") {
    assert.equal(forbidden.code, "COMMAND_TRANSITION_FORBIDDEN");
    assert.equal(forbidden.parameters.alternativeState, "start-preparation");
  }

  const prepare = engine.submit(command({
    ...baseCommandFields("cmd-prepare", "player-1", "unit-valmorne-1", 0),
    type: "RequestUnitState",
    payload: { state: "start-preparation" }
  }));
  assert.equal(prepare.status, "accepted");
  let unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.ok(unit?.transition);
  assert.equal(unit.transition.completesAtSec, 900);

  engine.advanceUntil(900, { stopOnImportantEvent: false });
  unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.equal(unit?.operatingState, "start-preparation");

  const produce = engine.submit(command({
    ...baseCommandFields("cmd-produce", "player-1", "unit-valmorne-1", 900),
    type: "RequestUnitState",
    payload: { state: "producing" }
  }));
  assert.equal(produce.status, "accepted");
  engine.advanceUntil(2700, { stopOnImportantEvent: false });
  unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.equal(unit?.operatingState, "producing");
});

test("100 MW for two simulated hours recomposes to 200 MWh", () => {
  const world = withUnit(valmorneWorld, "unit-valmorne-1", {
    operatingState: "producing",
    plannedNetPowerMw: 100,
    realizedNetPowerMw: 100,
    generatedMwh: 0
  });
  const engine = new DeterministicEngine(world, 205);
  engine.advanceUntil(7200, { stopOnImportantEvent: false });
  const unit = engine.worldState().assets["unit-valmorne-1"]?.productionUnit;
  assert.ok(unit);
  assert.equal(unit.realizedNetPowerMw, 100);
  assert.equal(unit.generatedMwh, 200);
});

test("player observation exposes a minimal production diagnostic without hidden future state", () => {
  const engine = new DeterministicEngine(valmorneWorld, 206);
  const observed = engine.observation().visibleAssets["unit-valmorne-1"]?.productionUnit;
  assert.ok(observed);
  assert.equal(observed.operatingState.value, "stopped");
  assert.equal(observed.nominalNetPowerMw.value, 900);
  assert.equal(observed.groups.turbine.available.value, true);
  assert.equal(observed.diagnostic.status, "stopped");
});
