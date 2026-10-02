import type { GameCommand } from "../contracts/commands.js";
import type { GameEvent } from "../contracts/events.js";
import type { PolicyState, Transaction, WorldState } from "../contracts/world.js";
import type { SerializedPrngState } from "../sim/prng.js";
import type { EngineJournalEntry, EngineSnapshot } from "../sim/engine.js";
import {
  CONTENT_VERSION,
  ENGINE_VERSION,
  PRNG_VERSION,
  SCHEMA_VERSION
} from "../contracts/versions.js";
import {
  validateWorldState,
  type ValidationIssue,
  type ValidationResult
} from "../contracts/validation.js";

export interface SavePayload {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly contentVersion: string;
  readonly simTimeSec: number;
  readonly world: WorldState;
  readonly prng: SerializedPrngState;
  readonly eventQueue: readonly GameEvent[];
  readonly pendingCommands: readonly GameCommand[];
  readonly executedEvents: readonly GameEvent[];
  readonly journal: readonly EngineJournalEntry[];
  readonly policies: Readonly<Record<string, PolicyState>>;
  readonly transactions: readonly Transaction[];
  readonly processedCommandIds: readonly string[];
  readonly commandSequence: number;
}

export interface SaveFile {
  readonly payload: SavePayload;
  readonly checksum: string;
}

export type ImportedSaveResult =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface SaveMetrics {
  readonly bytes: number;
  readonly pendingCommands: number;
  readonly journalEntries: number;
  readonly executedEvents: number;
  readonly transactions: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort()
    .map((key) => JSON.stringify(key) + ":" + stable(record[key]))
    .join(",") + "}";
}

function issue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  parameters: Readonly<Record<string, string | number | boolean>> = {}
): void {
  issues.push({ code, path, parameters });
}

export function checksumPayload(payload: SavePayload): string {
  const text = stable(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-v1:${hash.toString(16).padStart(8, "0")}`;
}

function payloadFromSnapshot(snapshot: EngineSnapshot, commandSequence: number): SavePayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    contentVersion: CONTENT_VERSION,
    simTimeSec: snapshot.world.simTimeSec,
    world: structuredClone(snapshot.world),
    prng: structuredClone(snapshot.prng),
    eventQueue: structuredClone(snapshot.world.futureEvents),
    pendingCommands: structuredClone(snapshot.pendingCommands),
    executedEvents: structuredClone(snapshot.executedEvents),
    journal: structuredClone(snapshot.journal),
    policies: structuredClone(snapshot.world.policies),
    transactions: structuredClone(snapshot.world.transactions),
    processedCommandIds: structuredClone(snapshot.world.processedCommandIds),
    commandSequence
  };
}

export function createSaveFromSnapshot(
  snapshot: EngineSnapshot,
  commandSequence = 0
): SaveFile {
  if (!Number.isSafeInteger(commandSequence) || commandSequence < 0) {
    throw new Error("SAVE_COMMAND_SEQUENCE_INVALID");
  }
  const payload = payloadFromSnapshot(snapshot, commandSequence);
  return { payload, checksum: checksumPayload(payload) };
}

export function createSave(world: WorldState, prng: SerializedPrngState): SaveFile {
  return createSaveFromSnapshot({
    world,
    prng,
    pendingCommands: [],
    journal: [],
    executedEvents: []
  });
}

export function engineSnapshotFromSave(save: SaveFile): EngineSnapshot {
  return {
    world: structuredClone(save.payload.world),
    prng: structuredClone(save.payload.prng),
    pendingCommands: structuredClone(save.payload.pendingCommands),
    journal: structuredClone(save.payload.journal),
    executedEvents: structuredClone(save.payload.executedEvents)
  };
}

export function validateSave(save: SaveFile): ValidationResult {
  const issues: ValidationIssue[] = [];
  const payload = save.payload;

  if (payload.schemaVersion !== SCHEMA_VERSION) {
    issue(issues, "SAVE_SCHEMA_VERSION_UNSUPPORTED", "$.payload.schemaVersion", {
      supported: SCHEMA_VERSION,
      received: payload.schemaVersion
    });
  }
  if (payload.engineVersion !== ENGINE_VERSION) {
    issue(issues, "SAVE_ENGINE_VERSION_UNSUPPORTED", "$.payload.engineVersion", {
      supported: ENGINE_VERSION
    });
  }
  if (payload.contentVersion !== CONTENT_VERSION) {
    issue(issues, "SAVE_CONTENT_VERSION_UNSUPPORTED", "$.payload.contentVersion", {
      supported: CONTENT_VERSION
    });
  }
  if (payload.prng.version !== PRNG_VERSION) {
    issue(issues, "SAVE_PRNG_VERSION_UNSUPPORTED", "$.payload.prng.version", {
      supported: PRNG_VERSION
    });
  }
  if (!Number.isSafeInteger(payload.commandSequence) || payload.commandSequence < 0) {
    issue(issues, "SAVE_COMMAND_SEQUENCE_INVALID", "$.payload.commandSequence");
  }
  if (payload.simTimeSec !== payload.world.simTimeSec) {
    issue(issues, "SAVE_SIM_TIME_MISMATCH", "$.payload.simTimeSec");
  }
  if (stable(payload.eventQueue) !== stable(payload.world.futureEvents)) {
    issue(issues, "SAVE_EVENT_QUEUE_MISMATCH", "$.payload.eventQueue");
  }
  if (stable(payload.policies) !== stable(payload.world.policies)) {
    issue(issues, "SAVE_POLICIES_MISMATCH", "$.payload.policies");
  }
  if (stable(payload.transactions) !== stable(payload.world.transactions)) {
    issue(issues, "SAVE_TRANSACTIONS_MISMATCH", "$.payload.transactions");
  }
  if (stable(payload.processedCommandIds) !== stable(payload.world.processedCommandIds)) {
    issue(issues, "SAVE_IDEMPOTENCE_IDS_MISMATCH", "$.payload.processedCommandIds");
  }

  for (const [index, pending] of payload.pendingCommands.entries()) {
    if (pending.targetSimTimeSec < payload.simTimeSec) {
      issue(issues, "SAVE_PENDING_COMMAND_IN_PAST", `$.payload.pendingCommands[${index}]`, {
        targetSimTimeSec: pending.targetSimTimeSec,
        simTimeSec: payload.simTimeSec
      });
    }
  }
  let previousSequence = 0;
  for (const [index, entry] of payload.journal.entries()) {
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= previousSequence) {
      issue(issues, "SAVE_JOURNAL_SEQUENCE_INVALID", `$.payload.journal[${index}].sequence`);
      break;
    }
    if (entry.atSec > payload.simTimeSec) {
      issue(issues, "SAVE_JOURNAL_TIME_IN_FUTURE", `$.payload.journal[${index}].atSec`);
      break;
    }
    previousSequence = entry.sequence;
  }
  for (const [index, event] of payload.executedEvents.entries()) {
    if (event.atSec > payload.simTimeSec) {
      issue(issues, "SAVE_EXECUTED_EVENT_IN_FUTURE", `$.payload.executedEvents[${index}].atSec`);
      break;
    }
  }

  if (save.checksum !== checksumPayload(payload)) {
    issue(issues, "SAVE_CHECKSUM_MISMATCH", "$.checksum");
  }

  try {
    const world = validateWorldState(payload.world);
    if (!world.ok) issues.push(...world.issues);
  } catch {
    issue(issues, "SAVE_WORLD_MALFORMED", "$.payload.world");
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function importSave(value: unknown): ImportedSaveResult {
  if (!isRecord(value) || !isRecord(value.payload) || typeof value.checksum !== "string") {
    return {
      ok: false,
      issues: [{
        code: "SAVE_FILE_MALFORMED",
        path: "$",
        parameters: {}
      }]
    };
  }

  const payload = value.payload;
  const arrays = [
    "eventQueue",
    "pendingCommands",
    "executedEvents",
    "journal",
    "transactions",
    "processedCommandIds"
  ] as const;
  const required =
    typeof payload.schemaVersion === "number" &&
    typeof payload.engineVersion === "string" &&
    typeof payload.contentVersion === "string" &&
    typeof payload.simTimeSec === "number" &&
    isRecord(payload.world) &&
    isRecord(payload.prng) &&
    isRecord(payload.policies) &&
    typeof payload.commandSequence === "number" &&
    arrays.every((key) => Array.isArray(payload[key]));

  if (!required) {
    return {
      ok: false,
      issues: [{
        code: "SAVE_FILE_MALFORMED",
        path: "$.payload",
        parameters: {}
      }]
    };
  }

  const save = value as unknown as SaveFile;
  const validation = validateSave(save);
  return validation.ok
    ? { ok: true, save }
    : { ok: false, issues: validation.issues };
}

export function importSaveJson(text: string): ImportedSaveResult {
  try {
    return importSave(JSON.parse(text) as unknown);
  } catch {
    return {
      ok: false,
      issues: [{
        code: "SAVE_JSON_INVALID",
        path: "$",
        parameters: {}
      }]
    };
  }
}

export function measureSave(save: SaveFile): SaveMetrics {
  const bytes = new TextEncoder().encode(JSON.stringify(save)).byteLength;
  return {
    bytes,
    pendingCommands: save.payload.pendingCommands.length,
    journalEntries: save.payload.journal.length,
    executedEvents: save.payload.executedEvents.length,
    transactions: save.payload.transactions.length
  };
}
