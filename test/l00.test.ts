import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import { baseEventFields, event } from "../src/contracts/events.js";
import { contractVolumeMwh, settlePrototypeDelivery } from "../src/contracts/delivery.js";
import { energyFromConstantPower } from "../src/contracts/units.js";
import { validateCommand, validateWorldState } from "../src/contracts/validation.js";
import { CONTRACT_VERSION, PRNG_VERSION } from "../src/contracts/versions.js";
import { valmorneDeliveryContract, valmorneWorld } from "../src/content/valmorne.js";
import { createSave, validateSave } from "../src/persistence/save.js";
import { CommandLedger } from "../src/sim/idempotency.js";
import { DeterministicPrng } from "../src/sim/prng.js";

test("valid minimal Valmorne scenario passes world validation", () => {
  assert.deepEqual(validateWorldState(valmorneWorld), { ok: true });
});

test("invalid scenario exposes an actionable stable issue", () => {
  const invalid = { ...valmorneWorld, cashCents: 1.5 };
  const result = validateWorldState(invalid);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "WORLD_CASH_NOT_INTEGER_CENTS");
});

test("typed command can be created and validated", () => {
  const cmd = command({
    ...baseCommandFields("cmd-1", "player-1", "plant-valmorne", 10),
    type: "SetPowerSchedule",
    payload: { points: [{ atSec: 20, netPowerMw: 700 }] }
  });
  assert.equal(cmd.contractVersion, CONTRACT_VERSION);
  assert.deepEqual(validateCommand(cmd, valmorneWorld), { ok: true });
});

test("typed event carries causal metadata", () => {
  const evt = event({
    ...baseEventFields("evt-1", 30, ["plant-valmorne"], null, "warning"),
    type: "FaultDetected",
    payload: { faultCode: "FIXTURE_FAULT" }
  });
  assert.equal(evt.causalParentId, null);
  assert.equal(evt.type, "FaultDetected");
});

test("same command id is recognized for idempotence", () => {
  const ledger = new CommandLedger();
  const cmd = command({
    ...baseCommandFields("cmd-idempotent", "player-1", "plant-valmorne", 10),
    type: "SetDelegationPolicy",
    payload: { policyId: "p1", enabled: true, maxAutomaticSpendCents: 1000 }
  });
  ledger.remember(cmd, { status: "accepted", commandId: cmd.id });
  assert.equal(ledger.has(cmd.id), true);
  assert.equal(ledger.lookup(cmd)?.status, "accepted");
  assert.throws(() => ledger.remember(cmd, { status: "accepted", commandId: cmd.id }), /COMMAND_DUPLICATE_ID/);
});

test("units and delivery constraints are explicit", () => {
  assert.equal(energyFromConstantPower(100, 3600), 100);
  assert.throws(() => energyFromConstantPower(100, 1.5), /UNIT_SIM_SECONDS_INVALID/);
  assert.equal(contractVolumeMwh(valmorneDeliveryContract), 800);
  const settlement = settlePrototypeDelivery(valmorneDeliveryContract, 750);
  assert.equal(settlement.shortfallMwh, 50);
  assert.ok(settlement.imbalanceCents < 0);
});

test("delivery settlement rejects invalid delivered energy with a stable code", () => {
  for (const deliveredMwh of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => settlePrototypeDelivery(valmorneDeliveryContract, deliveredMwh),
      /DELIVERY_DELIVERED_MWH_INVALID/
    );
  }
});

test("save schema accepts coherent state and rejects corruption", () => {
  const prng = new DeterministicPrng(42);
  const save = createSave(valmorneWorld, prng.serialize());
  assert.deepEqual(validateSave(save), { ok: true });
  const corrupt = { ...save, checksum: "fnv1a32-v1:00000000" };
  const result = validateSave(corrupt);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "SAVE_CHECKSUM_MISMATCH"));
});

test("PRNG is reproducible and serializable", () => {
  const a = new DeterministicPrng(123456);
  const b = new DeterministicPrng(123456);
  const seqA = [a.nextUint32(), a.nextUint32(), a.nextUint32()];
  const seqB = [b.nextUint32(), b.nextUint32(), b.nextUint32()];
  assert.deepEqual(seqA, seqB);
  const restored = DeterministicPrng.restore(a.serialize());
  assert.equal(restored.version, PRNG_VERSION);
  assert.equal(restored.nextUint32(), a.nextUint32());
});

test("duplicate processed command is rejected by validation", () => {
  const world = { ...valmorneWorld, processedCommandIds: ["cmd-dup"] };
  const cmd = command({
    ...baseCommandFields("cmd-dup", "player-1", "plant-valmorne", 10),
    type: "AssignTeam",
    payload: { teamId: "team-valmorne-a", taskId: "task-1" }
  });
  const result = validateCommand(cmd, world);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "COMMAND_DUPLICATE_ID"));
});

test("runtime command payload validation rejects invalid units with stable code", () => {
  const cmd = command({
    ...baseCommandFields("cmd-invalid-payload", "player-1", "plant-valmorne", 10),
    type: "SetPowerSchedule",
    payload: { points: [{ atSec: 20, netPowerMw: -1 }] }
  });
  const result = validateCommand(cmd, valmorneWorld);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) =>
      issue.code === "UNIT_POWER_MW_INVALID" &&
      issue.path === "$.payload.points[0].netPowerMw"
    ));
  }
});
