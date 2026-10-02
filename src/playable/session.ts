import type { CommandResult, GameCommand } from "../contracts/commands.js";
import { baseCommandFields, command } from "../contracts/commands.js";
import type { MaintenanceTaskKind } from "../contracts/maintenance.js";
import type { ProductionFunctionalGroupKind, ProductionOperatingState } from "../contracts/production.js";
import type { PlayerObservation } from "../contracts/world.js";
import { valmorneWorld } from "../content/valmorne.js";
import {
  createSaveFromSnapshot,
  engineSnapshotFromSave,
  importSave,
  type SaveFile
} from "../persistence/save.js";
import { DeterministicEngine } from "../sim/engine.js";

export type PlayableIntent =
  | { readonly type: "advance"; readonly seconds: number }
  | { readonly type: "request-unit-state"; readonly unitId: string; readonly state: ProductionOperatingState }
  | { readonly type: "set-power"; readonly unitId: string; readonly powerMw: number }
  | {
      readonly type: "schedule-maintenance";
      readonly unitId: string;
      readonly group: ProductionFunctionalGroupKind;
      readonly kind: MaintenanceTaskKind;
      readonly durationSec: number;
    }
  | { readonly type: "assign-team"; readonly teamId: string; readonly taskId: string }
  | { readonly type: "cancel-maintenance"; readonly unitId: string; readonly taskId: string }
  | { readonly type: "return-check"; readonly unitId: string; readonly taskId: string }
  | {
      readonly type: "buy-replacement";
      readonly contractId: string;
      readonly powerMw: number;
      readonly maxPriceEurPerMwh: number;
      readonly confirmed?: boolean;
    };

export type PlayableFeedbackStatus =
  | "accepted"
  | "adjusted"
  | "rejected"
  | "confirmation-required";

export interface PlayableFeedback {
  readonly status: PlayableFeedbackStatus;
  readonly code: string;
  readonly message: string;
  readonly commandId?: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}

export interface PlayableState {
  readonly observation: PlayerObservation;
  readonly feedback: PlayableFeedback | null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parsePlayableIntent(value: unknown): PlayableIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.type !== "string") return null;

  switch (item.type) {
    case "advance":
      return finitePositive(item.seconds)
        ? { type: "advance", seconds: Math.floor(item.seconds) }
        : null;
    case "request-unit-state":
      return typeof item.unitId === "string" && typeof item.state === "string"
        ? {
            type: "request-unit-state",
            unitId: item.unitId,
            state: item.state as ProductionOperatingState
          }
        : null;
    case "set-power":
      return typeof item.unitId === "string" && typeof item.powerMw === "number"
        ? { type: "set-power", unitId: item.unitId, powerMw: item.powerMw }
        : null;
    case "schedule-maintenance":
      return (
        typeof item.unitId === "string" &&
        typeof item.group === "string" &&
        typeof item.kind === "string" &&
        finitePositive(item.durationSec)
      )
        ? {
            type: "schedule-maintenance",
            unitId: item.unitId,
            group: item.group as ProductionFunctionalGroupKind,
            kind: item.kind as MaintenanceTaskKind,
            durationSec: Math.floor(item.durationSec)
          }
        : null;
    case "assign-team":
      return typeof item.teamId === "string" && typeof item.taskId === "string"
        ? { type: "assign-team", teamId: item.teamId, taskId: item.taskId }
        : null;
    case "cancel-maintenance":
      return typeof item.unitId === "string" && typeof item.taskId === "string"
        ? { type: "cancel-maintenance", unitId: item.unitId, taskId: item.taskId }
        : null;
    case "return-check":
      return typeof item.unitId === "string" && typeof item.taskId === "string"
        ? { type: "return-check", unitId: item.unitId, taskId: item.taskId }
        : null;
    case "buy-replacement":
      return (
        typeof item.contractId === "string" &&
        typeof item.powerMw === "number" &&
        typeof item.maxPriceEurPerMwh === "number"
      )
        ? {
            type: "buy-replacement",
            contractId: item.contractId,
            powerMw: item.powerMw,
            maxPriceEurPerMwh: item.maxPriceEurPerMwh,
            confirmed: item.confirmed === true
          }
        : null;
    default:
      return null;
  }
}

function feedbackFromResult(result: CommandResult): PlayableFeedback {
  if (result.status === "accepted") {
    return {
      status: "accepted",
      code: "COMMAND_ACCEPTED",
      message: "Action acceptée par le moteur.",
      commandId: result.commandId
    };
  }
  if (result.status === "adjusted") {
    return {
      status: "adjusted",
      code: result.adjustmentCode,
      message: "Action acceptée avec paramètres bornés par le moteur.",
      commandId: result.commandId,
      parameters: result.parameters
    };
  }
  return {
    status: "rejected",
    code: result.code,
    message: "Action refusée par le moteur. Consultez le motif et corrigez l'intention.",
    commandId: result.commandId,
    parameters: result.parameters
  };
}

export interface PlayableRestoreResult {
  readonly ok: boolean;
  readonly code: string;
  readonly issues?: readonly { readonly code: string; readonly path: string }[];
}

export class PlayableSession {
  private engine: DeterministicEngine;
  private sequence = 0;
  private lastFeedback: PlayableFeedback | null = null;

  constructor(seed = 606) {
    this.engine = new DeterministicEngine(valmorneWorld, seed);
  }

  state(): PlayableState {
    return {
      observation: this.engine.observation(),
      feedback: this.lastFeedback
    };
  }

  exportSave(): SaveFile {
    return createSaveFromSnapshot(this.engine.snapshot(), this.sequence);
  }

  restoreSave(value: unknown): PlayableRestoreResult {
    const imported = importSave(value);
    if (!imported.ok) {
      return {
        ok: false,
        code: imported.issues[0]?.code ?? "SAVE_IMPORT_REJECTED",
        issues: imported.issues.map((item) => ({ code: item.code, path: item.path }))
      };
    }

    let candidate: DeterministicEngine;
    try {
      candidate = DeterministicEngine.restore(engineSnapshotFromSave(imported.save));
    } catch {
      return { ok: false, code: "SAVE_ENGINE_RESTORE_FAILED" };
    }

    this.engine = candidate;
    this.sequence = imported.save.payload.commandSequence;
    this.lastFeedback = {
      status: "accepted",
      code: "SAVE_RESTORED",
      message: "Sauvegarde validée et reprise sans progression hors ligne."
    };
    return { ok: true, code: "SAVE_RESTORED" };
  }

  perform(intent: PlayableIntent): PlayableState {
    const observation = this.engine.observation();
    const now = observation.simTimeSec;
    const commandId = this.nextId(intent.type);
    let gameCommand: GameCommand | null = null;

    switch (intent.type) {
      case "advance":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", "plant-valmorne", now),
          type: "AdvanceUntil",
          payload: { untilSec: now + Math.max(1, Math.floor(intent.seconds)) }
        });
        break;
      case "request-unit-state":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.unitId, now),
          type: "RequestUnitState",
          payload: { state: intent.state }
        });
        break;
      case "set-power":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.unitId, now),
          type: "SetPowerSchedule",
          payload: { points: [{ atSec: now, netPowerMw: intent.powerMw }] }
        });
        break;
      case "schedule-maintenance": {
        const taskId = `ui-task-${this.sequence}`;
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.unitId, now),
          type: "ScheduleMaintenance",
          payload: {
            taskId,
            kind: intent.kind,
            targetGroup: intent.group,
            startsAtSec: now,
            expectedDurationSec: Math.max(60, Math.floor(intent.durationSec))
          }
        });
        break;
      }
      case "assign-team":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.teamId, now),
          type: "AssignTeam",
          payload: { teamId: intent.teamId, taskId: intent.taskId }
        });
        break;
      case "cancel-maintenance":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.unitId, now),
          type: "CancelMaintenance",
          payload: { taskId: intent.taskId }
        });
        break;
      case "return-check":
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", intent.unitId, now),
          type: "CompleteMaintenanceReturnCheck",
          payload: { taskId: intent.taskId }
        });
        break;
      case "buy-replacement": {
        const commitment = observation.economy.commitments.find(
          (candidate) => candidate.id === intent.contractId
        );
        if (!commitment) {
          this.lastFeedback = {
            status: "rejected",
            code: "UI_CONTRACT_UNKNOWN",
            message: "Engagement commercial inconnu dans l'observation."
          };
          return this.state();
        }
        if (commitment.settled || now >= commitment.deliveryEndSec) {
          this.lastFeedback = {
            status: "rejected",
            code: "UI_DELIVERY_WINDOW_CLOSED",
            message: "La fenêtre de couverture de cet engagement est fermée."
          };
          return this.state();
        }
        const deliveryStartSec = Math.max(now, commitment.deliveryStartSec);
        const durationHours = Math.max(0, commitment.deliveryEndSec - deliveryStartSec) / 3600;
        const estimatedCostCents = Math.round(
          intent.powerMw *
          durationHours *
          observation.economy.currentMarketPriceEurPerMwh.value *
          100
        );
        if (!intent.confirmed) {
          this.lastFeedback = {
            status: "confirmation-required",
            code: "UI_EXPENSIVE_COMMITMENT_CONFIRMATION",
            message: "Confirmation requise avant l'engagement de trésorerie.",
            parameters: {
              contractId: commitment.id,
              powerMw: intent.powerMw,
              estimatedCostCents
            }
          };
          return this.state();
        }
        gameCommand = command({
          ...baseCommandFields(commandId, "player-1", "connection-valmorne", now),
          type: "BuyReplacementEnergy",
          payload: {
            contractId: commitment.id,
            deliveryStartSec,
            deliveryEndSec: commitment.deliveryEndSec,
            powerMw: intent.powerMw,
            maxPriceEurPerMwh: intent.maxPriceEurPerMwh
          }
        });
        break;
      }
    }

    this.lastFeedback = feedbackFromResult(this.engine.submit(gameCommand));
    return this.state();
  }

  private nextId(kind: string): string {
    this.sequence += 1;
    return `ui-l07-${String(this.sequence).padStart(4, "0")}:${kind}`;
  }
}
