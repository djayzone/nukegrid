import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import { baseEventFields } from "../src/contracts/events.js";
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  UI_VERSION
} from "../src/contracts/versions.js";
import { valmorneWorld } from "../src/content/valmorne.js";
import {
  checksumPayload,
  createSaveFromSnapshot,
  engineSnapshotFromSave,
  importSave,
  measureSave
} from "../src/persistence/save.js";
import { PlayableSession } from "../src/playable/session.js";
import { DeterministicEngine } from "../src/sim/engine.js";

test("L07 versions persistence explicitly", () => {
  assert.equal(SCHEMA_VERSION, 5);
  assert.equal(ENGINE_VERSION, "0.7.0-l07");
  assert.ok(UI_VERSION.startsWith("0."));
});

test("mid-maintenance save/reload is identical to continuous execution", () => {
  const continuous = new PlayableSession(701);
  continuous.perform({
    type: "schedule-maintenance",
    unitId: "unit-valmorne-1",
    group: "turbine",
    kind: "inspection",
    durationSec: 3600
  });
  continuous.perform({
    type: "assign-team",
    teamId: "team-valmorne-a",
    taskId: "ui-task-1"
  });
  continuous.perform({ type: "advance", seconds: 1800 });

  const save = continuous.exportSave();
  const resumed = new PlayableSession(999);
  assert.deepEqual(resumed.restoreSave(save), { ok: true, code: "SAVE_RESTORED" });

  const uninterrupted = continuous.perform({ type: "advance", seconds: 1800 });
  const afterReload = resumed.perform({ type: "advance", seconds: 1800 });
  assert.deepEqual(afterReload.observation, uninterrupted.observation);
  assert.deepEqual(resumed.exportSave().payload.transactions, continuous.exportSave().payload.transactions);
});

test("corrupt import is rejected without replacing the active game", () => {
  const session = new PlayableSession(702);
  session.perform({ type: "advance", seconds: 900 });
  const before = session.state().observation;
  const valid = session.exportSave();
  const corrupt = { ...valid, checksum: "fnv1a32-v1:00000000" };

  const result = session.restoreSave(corrupt);
  assert.equal(result.ok, false);
  assert.equal(result.code, "SAVE_CHECKSUM_MISMATCH");
  assert.deepEqual(session.state().observation, before);
});

test("old schema is explicitly incompatible and never overwrites active state", () => {
  const session = new PlayableSession(703);
  session.perform({ type: "advance", seconds: 1200 });
  const before = session.state().observation;
  const current = session.exportSave();
  const oldPayload = {
    ...current.payload,
    schemaVersion: 4,
    engineVersion: "0.6.0-l06"
  };
  const old = {
    payload: oldPayload,
    checksum: checksumPayload(oldPayload as never)
  };

  const imported = importSave(old);
  assert.equal(imported.ok, false);
  if (!imported.ok) {
    assert.ok(imported.issues.some(issue => issue.code === "SAVE_SCHEMA_VERSION_UNSUPPORTED"));
    assert.ok(imported.issues.some(issue => issue.code === "SAVE_ENGINE_VERSION_UNSUPPORTED"));
  }
  assert.equal(session.restoreSave(old).ok, false);
  assert.deepEqual(session.state().observation, before);
});

test("pending commands, event queue and journal survive an engine snapshot", () => {
  const engine = new DeterministicEngine(valmorneWorld, 704);
  const policy = command({
    ...baseCommandFields("queued-policy", "player-1", "plant-valmorne", 1800),
    type: "SetDelegationPolicy",
    payload: { policyId: "queued-policy", enabled: true, maxAutomaticSpendCents: 0 }
  });
  assert.equal(engine.submit(policy).status, "accepted");
  engine.scheduleEvent({
    ...baseEventFields("queued-fault", 1200, ["unit-valmorne-1"], null, "warning"),
    type: "FaultDetected",
    payload: { faultCode: "L07_QUEUE_TEST" }
  });

  const save = createSaveFromSnapshot(engine.snapshot(), 17);
  const restored = DeterministicEngine.restore(engineSnapshotFromSave(save));
  assert.equal(restored.snapshot().pendingCommands.length, 1);
  assert.equal(restored.worldState().futureEvents.length, 1);

  restored.advanceUntil(1800, { stopOnImportantEvent: false });
  assert.equal(restored.worldState().policies["queued-policy"]?.enabled, true);
  assert.ok(restored.snapshot().executedEvents.some(event => event.id === "queued-fault"));
  assert.ok(restored.journal().some(entry => entry.id === "queued-policy"));
});

test("reload after a purchase cannot duplicate its transaction", () => {
  const engine = new DeterministicEngine(valmorneWorld, 705);
  const purchase = command({
    ...baseCommandFields("purchase-once", "player-1", "connection-valmorne", 0),
    type: "BuyReplacementEnergy",
    payload: {
      contractId: "delivery-valmorne-day-1",
      deliveryStartSec: 3600,
      deliveryEndSec: 7200,
      powerMw: 100,
      maxPriceEurPerMwh: 200
    }
  });
  assert.equal(engine.submit(purchase).status, "accepted");
  assert.equal(engine.worldState().transactions.filter(tx => tx.referenceId === "purchase-once").length, 1);

  const restored = DeterministicEngine.restore(
    engineSnapshotFromSave(createSaveFromSnapshot(engine.snapshot(), 1))
  );
  const duplicate = restored.submit(purchase);
  assert.equal(duplicate.status, "rejected");
  assert.equal(restored.worldState().transactions.filter(tx => tx.referenceId === "purchase-once").length, 1);
});

test("restoring a save never advances simulated time offline", () => {
  const session = new PlayableSession(706);
  session.perform({ type: "advance", seconds: 4321 });
  const save = session.exportSave();
  const resumed = new PlayableSession(1);
  resumed.restoreSave(save);
  assert.equal(resumed.state().observation.simTimeSec, 4321);
});

test("snapshot size is measured and remains bounded for the reference session", () => {
  const session = new PlayableSession(707);
  session.perform({ type: "advance", seconds: 21600 });
  const metrics = measureSave(session.exportSave());
  assert.ok(metrics.bytes > 1000);
  assert.ok(metrics.bytes < 500_000);
  assert.ok(metrics.journalEntries >= 1);
  console.log(
    `L07 snapshot metrics: bytes=${metrics.bytes} journal=${metrics.journalEntries} events=${metrics.executedEvents} transactions=${metrics.transactions}`
  );
});

test("browser persistence contract has IndexedDB current+previous, non-blocking autosave and quota reporting", () => {
  const persistence = readFileSync(resolve("web/persistence.js"), "utf8");
  const app = readFileSync(resolve("web/app.js"), "utf8");
  const html = readFileSync(resolve("web/index.html"), "utf8");

  assert.match(persistence, /indexedDB\.open/);
  assert.match(persistence, /slot: "previous"/);
  assert.match(persistence, /slot: "current"/);
  assert.match(persistence, /AUTOSAVE_DEBOUNCE_MS = 350/);
  assert.match(persistence, /QuotaExceededError/);
  assert.match(app, /setTimeout\(\(\) =>/);
  assert.match(app, /\/api\/save/);
  assert.match(app, /\/api\/load/);
  assert.match(app, /visibilityState === "hidden"/);
  assert.doesNotMatch(app, /Date\.now|performance\.now/);
  assert.match(html, /id="save-manual"/);
  assert.match(html, /id="export-save"/);
  assert.match(html, /id="import-save"/);
  assert.match(html, /id="persistence-feedback".*aria-live="polite"/);
});

test("save payload carries all exact-resume state required by L07", () => {
  const save = new PlayableSession(708).exportSave();
  assert.equal(save.payload.world.simTimeSec, save.payload.simTimeSec);
  assert.deepEqual(save.payload.eventQueue, save.payload.world.futureEvents);
  assert.deepEqual(save.payload.policies, save.payload.world.policies);
  assert.deepEqual(save.payload.transactions, save.payload.world.transactions);
  assert.deepEqual(save.payload.processedCommandIds, save.payload.world.processedCommandIds);
  assert.ok(Array.isArray(save.payload.pendingCommands));
  assert.ok(Array.isArray(save.payload.executedEvents));
  assert.ok(Array.isArray(save.payload.journal));
});
