import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import type { WorldState } from "../src/contracts/world.js";
import { valmorneWorld } from "../src/content/valmorne.js";
import { DeterministicEngine } from "../src/sim/engine.js";
import { maintenanceProposal } from "../src/sim/maintenance.js";

function schedule(
  id: string,
  kind: "inspection" | "repair",
  startsAtSec: number,
  expectedDurationSec = 600,
  group: "nuclear-island" | "turbine" | "generator" | "grid-connection" = "turbine"
) {
  return command({
    ...baseCommandFields(`cmd-${id}`, "player-1", "unit-valmorne-1", 0),
    type: "ScheduleMaintenance",
    payload: {
      taskId: id,
      kind,
      targetGroup: group,
      startsAtSec,
      expectedDurationSec
    }
  });
}

function assign(commandId: string, taskId: string, teamId: string, atSec = 0) {
  return command({
    ...baseCommandFields(commandId, "player-1", teamId, atSec),
    type: "AssignTeam",
    payload: { teamId, taskId }
  });
}

test("maintenance proposal exposes duration, cost, resources, lost production and unknowns before mutation", () => {
  const proposal = maintenanceProposal(valmorneWorld, schedule("preview", "inspection", 3600, 900));
  assert.equal(proposal.expectedDurationSec, 900);
  assert.ok(proposal.estimatedCostCents > 0);
  assert.deepEqual(proposal.requiredSkills, ["instrumentation"]);
  assert.match(proposal.effectSummary, /incertitude/);
  assert.ok(proposal.unknowns.length > 0);
  assert.equal(valmorneWorld.maintenance.tasks.preview, undefined);
});

test("Valmorne has two complementary maintenance teams", () => {
  const teams = Object.values(valmorneWorld.assets).filter((asset) => asset.kind === "team");
  assert.equal(teams.length, 2);
  assert.deepEqual(valmorneWorld.assets["team-valmorne-a"]?.maintenanceTeam?.skills, ["mechanical", "electrical"]);
  assert.deepEqual(valmorneWorld.assets["team-valmorne-b"]?.maintenanceTeam?.skills, ["instrumentation", "electrical"]);
});

test("one team cannot be reserved on two incompatible tasks", () => {
  const engine = new DeterministicEngine(valmorneWorld, 301);
  assert.equal(engine.submit(schedule("repair-a", "repair", 3600)).status, "accepted");
  assert.equal(engine.submit(schedule("repair-b", "repair", 7200)).status, "accepted");
  assert.equal(engine.submit(assign("cmd-team-a-1", "repair-a", "team-valmorne-a")).status, "accepted");
  const result = engine.submit(assign("cmd-team-a-2", "repair-b", "team-valmorne-a"));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE");
    assert.equal(result.parameters.reason, "team-already-reserved");
  }
});

test("task becomes blocked when its start arrives without a team", () => {
  const engine = new DeterministicEngine(valmorneWorld, 302);
  assert.equal(engine.submit(schedule("blocked", "inspection", 60)).status, "accepted");
  engine.advanceUntil(60, { stopOnImportantEvent: false });
  const task = engine.worldState().maintenance.tasks.blocked;
  assert.equal(task?.status, "blocked");
  assert.equal(task?.blockedReason, "missing-team");
  assert.equal(engine.observation().recentEvents.at(-1)?.type, "MaintenanceBlocked");
});

test("inspection reduces uncertainty without repairing the real condition", () => {
  const engine = new DeterministicEngine(valmorneWorld, 303);
  const before = engine.worldState().maintenance.equipment["unit-valmorne-1:turbine"]!;
  assert.equal(before.actualCondition, "degraded");
  assert.equal(before.estimatedCondition, "healthy");
  assert.equal(before.uncertaintyPct, 65);

  assert.equal(engine.submit(schedule("inspect-turbine", "inspection", 60)).status, "accepted");
  assert.equal(engine.submit(assign("cmd-inspect-team", "inspect-turbine", "team-valmorne-b")).status, "accepted");
  engine.advanceUntil(660, { stopOnImportantEvent: false });

  const after = engine.worldState().maintenance.equipment["unit-valmorne-1:turbine"]!;
  assert.equal(after.actualCondition, "degraded");
  assert.equal(after.estimatedCondition, "degraded");
  assert.equal(after.uncertaintyPct, 5);
  assert.equal(engine.worldState().maintenance.tasks["inspect-turbine"]?.status, "completed");
});

test("repair improves only the targeted condition and requires a return check", () => {
  const engine = new DeterministicEngine(valmorneWorld, 304);
  const before = engine.worldState().maintenance.equipment["unit-valmorne-1:turbine"]!;
  assert.equal(before.actualCondition, "degraded");

  assert.equal(engine.submit(schedule("repair-turbine", "repair", 60)).status, "accepted");
  assert.equal(engine.submit(assign("cmd-repair-team", "repair-turbine", "team-valmorne-a")).status, "accepted");
  engine.advanceUntil(660, { stopOnImportantEvent: false });

  let world = engine.worldState();
  const repaired = world.maintenance.equipment["unit-valmorne-1:turbine"]!;
  assert.equal(repaired.actualCondition, "healthy");
  assert.ok(repaired.wearBasisPoints > 0);
  assert.ok(repaired.wearBasisPoints < before.wearBasisPoints);
  assert.equal(world.maintenance.tasks["repair-turbine"]?.status, "awaiting-return-check");
  assert.equal(world.assets["unit-valmorne-1"]?.productionUnit?.groups.turbine.available, false);

  const returnResult = engine.submit(command({
    ...baseCommandFields("cmd-return-check", "player-1", "unit-valmorne-1", 660),
    type: "CompleteMaintenanceReturnCheck",
    payload: { taskId: "repair-turbine" }
  }));
  assert.equal(returnResult.status, "accepted");
  world = engine.worldState();
  assert.equal(world.maintenance.tasks["repair-turbine"]?.status, "completed");
  assert.equal(world.assets["unit-valmorne-1"]?.productionUnit?.groups.turbine.available, true);
});

test("cancelling a planned task releases the team but keeps committed costs", () => {
  const engine = new DeterministicEngine(valmorneWorld, 305);
  const initialCash = engine.worldState().cashCents;
  assert.equal(engine.submit(schedule("cancelled", "inspection", 3600)).status, "accepted");
  const reservedCash = engine.worldState().cashCents;
  assert.ok(reservedCash < initialCash);
  assert.equal(engine.submit(assign("cmd-cancel-team", "cancelled", "team-valmorne-b")).status, "accepted");

  const cancelled = engine.submit(command({
    ...baseCommandFields("cmd-cancel", "player-1", "unit-valmorne-1", 0),
    type: "CancelMaintenance",
    payload: { taskId: "cancelled" }
  }));
  assert.equal(cancelled.status, "accepted");
  const world = engine.worldState();
  assert.equal(world.cashCents, reservedCash);
  assert.equal(world.maintenance.tasks.cancelled?.status, "cancelled");
  assert.equal(world.assets["team-valmorne-b"]?.maintenanceTeam?.reservedTaskId, null);
  assert.equal(world.transactions.filter((tx) => tx.referenceId === "cancelled").length, 1);
});

test("skill requirements cannot be bypassed by spending", () => {
  const engine = new DeterministicEngine(valmorneWorld, 306);
  assert.equal(engine.submit(schedule("inspection-skill", "inspection", 3600)).status, "accepted");
  const result = engine.submit(assign("cmd-wrong-team", "inspection-skill", "team-valmorne-a"));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "COMMAND_MAINTENANCE_SKILL_MISSING");
  }
});

test("simulated duration advances wear and can cause a deterministic fault without clicks", () => {
  const item = valmorneWorld.maintenance.equipment["unit-valmorne-1:turbine"]!;
  const world: WorldState = {
    ...valmorneWorld,
    maintenance: {
      ...valmorneWorld.maintenance,
      equipment: {
        ...valmorneWorld.maintenance.equipment,
        [item.id]: {
          ...item,
          wearBasisPoints: 8998,
          actualCondition: "degraded"
        }
      }
    }
  };
  const engine = new DeterministicEngine(world, 307);
  engine.observation();
  engine.observation();
  assert.equal(engine.worldState().maintenance.equipment[item.id]?.wearBasisPoints, 8998);
  engine.advanceUntil(3600, { stopOnImportantEvent: false });
  const after = engine.worldState();
  assert.equal(after.maintenance.equipment[item.id]?.actualCondition, "faulted");
  assert.equal(after.assets["unit-valmorne-1"]?.productionUnit?.groups.turbine.available, false);
});
