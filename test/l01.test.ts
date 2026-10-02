import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import { baseEventFields, event } from "../src/contracts/events.js";
import { valmorneWorld } from "../src/content/valmorne.js";
import { SimulationClock, type SimulationSpeed } from "../src/sim/clock.js";
import { DeterministicEngine } from "../src/sim/engine.js";
import type { EngineWorkerResponse } from "../src/worker/protocol.js";
import { EngineWorkerRuntime } from "../src/worker/runtime.js";

function delegationCommand(id: string, atSec: number, enabled: boolean) {
  return command({
    ...baseCommandFields(id, "player-1", "plant-valmorne", atSec),
    type: "SetDelegationPolicy",
    payload: {
      policyId: id,
      enabled,
      maxAutomaticSpendCents: 10_000
    }
  });
}

function runValmorneDay(speed: SimulationSpeed) {
  const engine = new DeterministicEngine(valmorneWorld, 424242);
  const clock = new SimulationClock();
  clock.setPaused(false);
  clock.setSpeed(speed);

  engine.submit(delegationCommand("cmd-policy-a", 3600, true));
  engine.submit(delegationCommand("cmd-policy-b", 7200, false));

  const endSec = 24 * 3600;
  while (engine.simTimeSec < endSec) {
    const budget = Math.min(clock.budgetSimSeconds(60), endSec - engine.simTimeSec);
    const result = engine.advanceUntil(engine.simTimeSec + budget, { stopOnImportantEvent: false });
    assert.equal(result.reason, "target-reached");
  }
  return engine.snapshot();
}

test("same seed and commands produce the same 24h state at different speeds", () => {
  assert.deepEqual(runValmorneDay(1), runValmorneDay(20));
});

test("pause consumes no simulated time", () => {
  const engine = new DeterministicEngine(valmorneWorld, 7);
  const clock = new SimulationClock();
  clock.setPaused(true);
  clock.setSpeed(60);
  const before = engine.simTimeSec;
  const budget = clock.budgetSimSeconds(60);
  if (budget > 0) engine.advanceUntil(engine.simTimeSec + budget);
  assert.equal(engine.simTimeSec, before);
});

test("AdvanceUntil is executable and duplicate command ids have no second effect", () => {
  const engine = new DeterministicEngine(valmorneWorld, 9);
  const advance = command({
    ...baseCommandFields("cmd-advance", "player-1", "engine", 0),
    type: "AdvanceUntil",
    payload: { untilSec: 120 }
  });
  const first = engine.submit(advance);
  const second = engine.submit(advance);
  assert.deepEqual(second, first);
  assert.equal(engine.simTimeSec, 120);
  assert.equal(engine.worldState().processedCommandIds.filter((id) => id === "cmd-advance").length, 1);
  assert.equal(engine.journal().filter((entry) => entry.kind === "command-executed" && entry.id === "cmd-advance").length, 1);
});

test("simultaneous commands and events use a stable deterministic order", () => {
  const engine = new DeterministicEngine(valmorneWorld, 11);
  engine.submit(delegationCommand("cmd-b", 100, true));
  engine.submit(delegationCommand("cmd-a", 100, false));

  engine.scheduleEvent(event({
    ...baseEventFields("evt-b", 100, ["plant-valmorne"], null, "info"),
    type: "FaultDetected",
    payload: { faultCode: "B" }
  }));
  engine.scheduleEvent(event({
    ...baseEventFields("evt-a", 100, ["plant-valmorne"], null, "info"),
    type: "FaultDetected",
    payload: { faultCode: "A" }
  }));

  engine.advanceUntil(100, { stopOnImportantEvent: false });
  const order = engine.journal()
    .filter((entry) => entry.atSec === 100 && (entry.kind === "command-executed" || entry.kind === "event"))
    .map((entry) => `${entry.kind}:${entry.id}`);

  assert.deepEqual(order, [
    "command-executed:cmd-a",
    "command-executed:cmd-b",
    "event:evt-a",
    "event:evt-b"
  ]);
});

test("render observations do not influence clock or PRNG", () => {
  const observed = new DeterministicEngine(valmorneWorld, 123);
  const control = new DeterministicEngine(valmorneWorld, 123);

  for (let index = 0; index < 100; index += 1) observed.observation();
  observed.advanceUntil(3600, { stopOnImportantEvent: false });
  control.advanceUntil(3600, { stopOnImportantEvent: false });

  assert.deepEqual(observed.snapshot(), control.snapshot());
  assert.equal(observed.nextRandomUint32(), control.nextRandomUint32());
});

test("important events interrupt a large deterministic advance", () => {
  const engine = new DeterministicEngine(valmorneWorld, 31);
  engine.scheduleEvent(event({
    ...baseEventFields("evt-warning", 900, ["plant-valmorne"], null, "warning"),
    type: "FaultDetected",
    payload: { faultCode: "TEST_WARNING" }
  }));

  const result = engine.advanceUntil(24 * 3600);
  assert.equal(result.reason, "important-event");
  assert.equal(result.eventId, "evt-warning");
  assert.equal(engine.simTimeSec, 900);
});

test("worker runtime yields between chunks and can cancel a large advance", async () => {
  const engine = new DeterministicEngine(valmorneWorld, 55);
  const responses: EngineWorkerResponse[] = [];
  let yields = 0;
  let runtime: EngineWorkerRuntime;

  runtime = new EngineWorkerRuntime(
    engine,
    (response) => responses.push(response),
    async () => {
      yields += 1;
      if (yields === 1) {
        await runtime.handle({
          type: "cancel",
          requestId: "cancel-1",
          targetRequestId: "advance-1"
        });
      }
    }
  );

  await runtime.handle({
    type: "advance",
    requestId: "advance-1",
    untilSec: 24 * 3600,
    chunkSec: 600
  });

  assert.equal(yields, 1);
  assert.equal(engine.simTimeSec, 600);
  assert.ok(responses.some((response) =>
    response.type === "advance-complete" &&
    response.requestId === "advance-1" &&
    response.reason === "cancelled"
  ));
});
