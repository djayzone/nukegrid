import type {
  AssignTeamCommand,
  BuyReplacementEnergyCommand,
  CancelMaintenanceCommand,
  CommandResult,
  CompleteMaintenanceReturnCheckCommand,
  GameCommand,
  RejectionCode,
  RequestUnitStateCommand,
  ScheduleMaintenanceCommand,
  SetDelegationPolicyCommand,
  SetPowerScheduleCommand
} from "../contracts/commands.js";
import type { GameEvent } from "../contracts/events.js";
import { PRODUCTION_GROUP_KINDS } from "../contracts/production.js";
import { assertIntegerSimSeconds, type SimSeconds } from "../contracts/units.js";
import { validateCommand } from "../contracts/validation.js";
import type { PlayerObservation, WorldState } from "../contracts/world.js";
import { CommandLedger } from "./idempotency.js";
import {
  accumulateDeliveryGeneration,
  applyEconomyBoundaries,
  buyReplacementEnergy,
  checkReplacementEnergyCommand,
  economyObservation,
  nextEconomyBoundaryAt,
  totalGeneratedMwh
} from "./economy.js";
import {
  advanceMaintenanceUsage,
  applyMaintenanceBoundaries,
  assignMaintenanceTeam,
  cancelMaintenance,
  checkMaintenanceCommand,
  completeMaintenanceReturnCheck,
  maintenanceObservation,
  nextMaintenanceBoundaryAt,
  scheduleMaintenance
} from "./maintenance.js";
import {
  advanceProductionTo,
  applyProductionBoundaries,
  checkUnitTransition,
  getProductionUnit,
  maximumSchedulablePower,
  nextProductionBoundaryAt,
  productionDiagnostic,
  setUnitPowerSchedule,
  startUnitTransition,
  updateProductionUnit
} from "./production.js";
import { DeterministicPrng, type SerializedPrngState } from "./prng.js";
import {
  applyScenarioBoundaries,
  nextScenarioBoundaryAt,
  scenarioObservation
} from "./scenario.js";
import { DeterministicQueue } from "./queue.js";

export type AdvanceStopReason = "target-reached" | "important-event";

export interface AdvanceResult {
  readonly reason: AdvanceStopReason;
  readonly simTimeSec: SimSeconds;
  readonly eventId?: string;
}

export type EngineJournalEntry =
  | {
      readonly sequence: number;
      readonly atSec: SimSeconds;
      readonly kind: "command-executed";
      readonly id: string;
      readonly type: GameCommand["type"];
    }
  | {
      readonly sequence: number;
      readonly atSec: SimSeconds;
      readonly kind: "command-rejected";
      readonly id: string;
      readonly code: RejectionCode;
    }
  | {
      readonly sequence: number;
      readonly atSec: SimSeconds;
      readonly kind: "event";
      readonly id: string;
      readonly type: GameEvent["type"];
    }
  | {
      readonly sequence: number;
      readonly atSec: SimSeconds;
      readonly kind: "advance-stopped";
      readonly id: string;
      readonly reason: "important-event";
    };

export interface EngineSnapshot {
  readonly world: WorldState;
  readonly prng: SerializedPrngState;
  readonly pendingCommands: readonly GameCommand[];
  readonly journal: readonly EngineJournalEntry[];
  readonly executedEvents: readonly GameEvent[];
}

export interface AdvanceOptions {
  readonly stopOnImportantEvent?: boolean;
}

const REJECTION_CODES: readonly RejectionCode[] = [
  "COMMAND_SCHEMA_INVALID",
  "COMMAND_VERSION_UNSUPPORTED",
  "COMMAND_TARGET_TIME_PAST",
  "COMMAND_DUPLICATE_ID",
  "COMMAND_ACTOR_UNAUTHORIZED",
  "COMMAND_TARGET_UNKNOWN",
  "COMMAND_INVARIANT_VIOLATION",
  "COMMAND_POWER_UNAVAILABLE",
  "COMMAND_TRANSITION_FORBIDDEN",
  "COMMAND_MAINTENANCE_TASK_CONFLICT",
  "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE",
  "COMMAND_MAINTENANCE_SKILL_MISSING",
  "COMMAND_MAINTENANCE_STATE_INVALID",
  "COMMAND_CASH_INSUFFICIENT",
  "COMMAND_MARKET_PRICE_LIMIT",
  "COMMAND_MARKET_LIQUIDITY_LIMIT",
  "COMMAND_DELIVERY_WINDOW_INVALID",
  "COMMAND_DELIVERY_ALREADY_SETTLED"
];

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function toRejectionCode(code: string): RejectionCode {
  return REJECTION_CODES.includes(code as RejectionCode)
    ? code as RejectionCode
    : "COMMAND_SCHEMA_INVALID";
}

function isImportantEvent(event: GameEvent): boolean {
  return event.severity === "warning" || event.severity === "critical";
}

interface OperationalRejection {
  readonly code: RejectionCode;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export class DeterministicEngine {
  private world: WorldState;
  private readonly prng: DeterministicPrng;
  private readonly ledger = new CommandLedger();
  private readonly commandQueue = new DeterministicQueue<GameCommand>();
  private readonly eventQueue: DeterministicQueue<GameEvent>;
  private readonly journalEntries: EngineJournalEntry[] = [];
  private readonly executedEvents: GameEvent[] = [];
  private journalSequence = 0;

  constructor(initialWorld: WorldState, seedOrState: number | SerializedPrngState) {
    this.world = cloneValue(initialWorld);
    this.prng = new DeterministicPrng(seedOrState);
    this.eventQueue = new DeterministicQueue(
      initialWorld.futureEvents.map((event) => ({
        atSec: event.atSec,
        id: event.id,
        value: cloneValue(event)
      }))
    );
    this.syncFutureEvents();
  }

  static restore(snapshot: EngineSnapshot): DeterministicEngine {
    const engine = new DeterministicEngine(snapshot.world, snapshot.prng);
    for (const pending of snapshot.pendingCommands) {
      if (pending.targetSimTimeSec < snapshot.world.simTimeSec) {
        throw new Error("ENGINE_SNAPSHOT_PENDING_COMMAND_PAST");
      }
      engine.commandQueue.push({
        atSec: pending.targetSimTimeSec,
        id: pending.id,
        value: cloneValue(pending)
      });
    }
    engine.journalEntries.push(...cloneValue(snapshot.journal));
    engine.executedEvents.push(...cloneValue(snapshot.executedEvents));
    engine.journalSequence = snapshot.journal.reduce(
      (maximum, entry) => Math.max(maximum, entry.sequence),
      0
    );
    return engine;
  }

  get simTimeSec(): SimSeconds {
    return this.world.simTimeSec;
  }

  worldState(): WorldState {
    return cloneValue(this.world);
  }

  journal(): readonly EngineJournalEntry[] {
    return cloneValue(this.journalEntries);
  }

  snapshot(): EngineSnapshot {
    return {
      world: this.worldState(),
      prng: this.prng.serialize(),
      pendingCommands: this.commandQueue.snapshot().map((entry) => cloneValue(entry.value)),
      journal: this.journal(),
      executedEvents: cloneValue(this.executedEvents)
    };
  }

  observation(): PlayerObservation {
    const visibleAssets: Record<string, PlayerObservation["visibleAssets"][string]> = {};
    for (const [id, asset] of Object.entries(this.world.assets)) {
      const base = {
        label: asset.label,
        available: {
          confidence: "known" as const,
          value: asset.available,
          observedAtSec: this.world.simTimeSec
        }
      };
      const maintenanceTeam = asset.maintenanceTeam
        ? {
            skills: [...asset.maintenanceTeam.skills],
            reservedTaskId: {
              confidence: "known" as const,
              value: asset.maintenanceTeam.reservedTaskId,
              observedAtSec: this.world.simTimeSec
            },
            unavailableUntilSec: {
              confidence: "known" as const,
              value: asset.maintenanceTeam.unavailableUntilSec,
              observedAtSec: this.world.simTimeSec
            }
          }
        : undefined;

      if (!asset.productionUnit) {
        visibleAssets[id] = maintenanceTeam ? { ...base, maintenanceTeam } : base;
        continue;
      }
      const unit = asset.productionUnit;
      const groups = Object.fromEntries(
        PRODUCTION_GROUP_KINDS.map((kind) => {
          const group = unit.groups[kind];
          return [
            kind,
            {
              label: group.label,
              available: {
                confidence: "known" as const,
                value: group.available,
                observedAtSec: this.world.simTimeSec
              }
            }
          ];
        })
      ) as PlayerObservation["visibleAssets"][string]["productionUnit"] extends infer T
        ? T extends { groups: infer G } ? G : never
        : never;
      visibleAssets[id] = {
        ...base,
        productionUnit: {
          operatingState: {
            confidence: "known",
            value: unit.operatingState,
            observedAtSec: this.world.simTimeSec
          },
          nominalNetPowerMw: {
            confidence: "known",
            value: unit.nominalNetPowerMw,
            observedAtSec: this.world.simTimeSec
          },
          availableNetPowerMw: {
            confidence: "known",
            value: unit.availableNetPowerMw,
            observedAtSec: this.world.simTimeSec
          },
          plannedNetPowerMw: {
            confidence: "known",
            value: unit.plannedNetPowerMw,
            observedAtSec: this.world.simTimeSec
          },
          realizedNetPowerMw: {
            confidence: "known",
            value: unit.realizedNetPowerMw,
            observedAtSec: this.world.simTimeSec
          },
          generatedMwh: {
            confidence: "known",
            value: unit.generatedMwh,
            observedAtSec: this.world.simTimeSec
          },
          groups,
          diagnostic: productionDiagnostic(unit)
        }
      };
    }
    return {
      simTimeSec: this.world.simTimeSec,
      visibleAssets,
      maintenance: maintenanceObservation(this.world),
      economy: economyObservation(this.world),
      scenario: scenarioObservation(this.world, this.executedEvents, this.journalEntries),
      cashCents: {
        confidence: "known",
        value: this.world.cashCents,
        observedAtSec: this.world.simTimeSec
      },
      recentEvents: cloneValue(this.executedEvents.slice(-20))
    };
  }

  nextRandomUint32(): number {
    return this.prng.nextUint32();
  }

  scheduleEvent(event: GameEvent): void {
    if (event.atSec < this.world.simTimeSec) throw new Error("ENGINE_EVENT_TIME_PAST");
    this.eventQueue.push({ atSec: event.atSec, id: event.id, value: cloneValue(event) });
    this.syncFutureEvents();
  }

  submit(command: GameCommand): CommandResult {
    const previous = this.ledger.lookup(command);
    if (previous) return cloneValue(previous);

    const validation = validateCommand(command, this.world);
    if (!validation.ok) {
      const first = validation.issues[0];
      const code = toRejectionCode(first?.code ?? "COMMAND_SCHEMA_INVALID");
      return this.reject(command, code, first
        ? { validationCode: first.code, path: first.path, ...first.parameters }
        : {});
    }

    const operational = this.operationalRejection(command);
    if (operational) {
      return this.reject(command, operational.code, operational.parameters);
    }

    const accepted: CommandResult = { status: "accepted", commandId: command.id };
    this.ledger.remember(command, accepted);
    this.world = {
      ...this.world,
      processedCommandIds: [...this.world.processedCommandIds, command.id]
    };

    if (command.type === "AdvanceUntil") {
      this.record({
        kind: "command-executed",
        id: command.id,
        type: command.type
      });
      this.advanceUntil(command.payload.untilSec);
      return cloneValue(accepted);
    }

    if (command.targetSimTimeSec === this.world.simTimeSec) {
      this.applyCommand(command);
    } else {
      this.commandQueue.push({
        atSec: command.targetSimTimeSec,
        id: command.id,
        value: cloneValue(command)
      });
    }
    return cloneValue(accepted);
  }

  advanceUntil(targetSec: SimSeconds, options: AdvanceOptions = {}): AdvanceResult {
    assertIntegerSimSeconds(targetSec);
    if (targetSec < this.world.simTimeSec) throw new Error("ENGINE_ADVANCE_TARGET_PAST");
    const stopOnImportantEvent = options.stopOnImportantEvent ?? true;

    while (true) {
      const nextCommandAt = this.commandQueue.peek()?.atSec ?? Number.POSITIVE_INFINITY;
      const nextEventAt = this.eventQueue.peek()?.atSec ?? Number.POSITIVE_INFINITY;
      const nextProductionAt = nextProductionBoundaryAt(this.world) ?? Number.POSITIVE_INFINITY;
      const nextMaintenanceAt = nextMaintenanceBoundaryAt(this.world) ?? Number.POSITIVE_INFINITY;
      const nextEconomyAt = nextEconomyBoundaryAt(this.world) ?? Number.POSITIVE_INFINITY;
      const nextScenarioAt = nextScenarioBoundaryAt(this.world) ?? Number.POSITIVE_INFINITY;
      const nextDueAt = Math.min(
        nextCommandAt,
        nextEventAt,
        nextProductionAt,
        nextMaintenanceAt,
        nextEconomyAt,
        nextScenarioAt
      );

      if (nextDueAt > targetSec || !Number.isFinite(nextDueAt)) break;
      if (nextDueAt < this.world.simTimeSec) throw new Error("ENGINE_QUEUE_TIME_PAST");
      this.setSimTime(nextDueAt);

      if (nextCommandAt === nextDueAt) {
        for (const entry of this.commandQueue.drainAt(nextDueAt)) {
          if (entry.value.type === "AdvanceUntil") {
            throw new Error("ENGINE_ADVANCE_UNTIL_QUEUE_INVARIANT");
          }
          this.applyCommand(entry.value);
        }
      }

      let importantEventId: string | undefined;
      if (nextEventAt === nextDueAt) {
        const dueEvents = this.eventQueue.drainAt(nextDueAt).map((entry) => cloneValue(entry.value));
        importantEventId = this.emitEvents(dueEvents) ?? importantEventId;
        this.syncFutureEvents();
      }

      this.world = applyProductionBoundaries(this.world);
      const maintenance = applyMaintenanceBoundaries(this.world);
      this.world = maintenance.world;
      importantEventId = this.emitEvents(maintenance.events) ?? importantEventId;

      const economy = applyEconomyBoundaries(this.world);
      this.world = economy.world;
      importantEventId = this.emitEvents(economy.events) ?? importantEventId;

      const scenario = applyScenarioBoundaries(this.world);
      this.world = scenario.world;
      importantEventId = this.emitEvents(scenario.events) ?? importantEventId;

      if (stopOnImportantEvent && importantEventId) {
        this.record({
          kind: "advance-stopped",
          id: importantEventId,
          reason: "important-event"
        });
        return {
          reason: "important-event",
          simTimeSec: this.world.simTimeSec,
          eventId: importantEventId
        };
      }
    }

    this.setSimTime(targetSec);
    return { reason: "target-reached", simTimeSec: this.world.simTimeSec };
  }

  private operationalRejection(command: GameCommand): OperationalRejection | null {
    if (command.type === "BuyReplacementEnergy") {
      return checkReplacementEnergyCommand(this.world, command);
    }

    if (
      command.type === "ScheduleMaintenance" ||
      command.type === "AssignTeam" ||
      command.type === "CancelMaintenance" ||
      command.type === "CompleteMaintenanceReturnCheck"
    ) {
      return checkMaintenanceCommand(this.world, command);
    }

    if (command.type === "SetPowerSchedule") {
      if (command.targetSimTimeSec !== this.world.simTimeSec) {
        return {
          code: "COMMAND_INVARIANT_VIOLATION",
          parameters: {
            reason: "power-schedule-command-must-execute-at-current-time",
            now: this.world.simTimeSec
          }
        };
      }
      const unit = getProductionUnit(this.world, command.targetId);
      if (!unit) {
        return {
          code: "COMMAND_TARGET_UNKNOWN",
          parameters: { reason: "target-is-not-production-unit", targetId: command.targetId }
        };
      }
      const maxNetPowerMw = maximumSchedulablePower(unit);
      const impossible = command.payload.points.find((point) => point.netPowerMw > maxNetPowerMw);
      if (impossible) {
        return {
          code: "COMMAND_POWER_UNAVAILABLE",
          parameters: {
            requestedNetPowerMw: impossible.netPowerMw,
            maxNetPowerMw,
            alternativeNetPowerMw: maxNetPowerMw,
            reason: "setpoint-above-available-capacity"
          }
        };
      }
    }

    if (command.type === "RequestUnitState") {
      if (command.targetSimTimeSec !== this.world.simTimeSec) {
        return {
          code: "COMMAND_INVARIANT_VIOLATION",
          parameters: {
            reason: "unit-transition-command-must-execute-at-current-time",
            now: this.world.simTimeSec
          }
        };
      }
      const unit = getProductionUnit(this.world, command.targetId);
      if (!unit) {
        return {
          code: "COMMAND_TARGET_UNKNOWN",
          parameters: { reason: "target-is-not-production-unit", targetId: command.targetId }
        };
      }
      const transition = checkUnitTransition(unit, command.payload.state);
      if (!transition.ok) {
        return {
          code: "COMMAND_TRANSITION_FORBIDDEN",
          parameters: {
            reason: transition.reason,
            currentState: unit.operatingState,
            requestedState: command.payload.state,
            alternativeState: transition.alternativeState
          }
        };
      }
    }

    if (command.type === "AdvanceUntil" && command.targetSimTimeSec !== this.world.simTimeSec) {
      return {
        code: "COMMAND_INVARIANT_VIOLATION",
        parameters: {
          reason: "advance-until-must-execute-at-current-time",
          now: this.world.simTimeSec,
          targetSimTimeSec: command.targetSimTimeSec
        }
      };
    }

    return null;
  }

  private reject(
    command: GameCommand,
    code: RejectionCode,
    parameters: Readonly<Record<string, string | number | boolean>>
  ): CommandResult {
    const result: CommandResult = {
      status: "rejected",
      commandId: command.id,
      code,
      parameters
    };
    this.ledger.remember(command, result);
    this.record({
      kind: "command-rejected",
      id: command.id,
      code
    });
    return cloneValue(result);
  }

  private applyCommand(command: Exclude<GameCommand, { type: "AdvanceUntil" }>): void {
    let generatedEvents: readonly GameEvent[] = [];
    if (command.type === "SetDelegationPolicy") this.applyDelegationPolicy(command);
    if (command.type === "SetPowerSchedule") this.applyPowerSchedule(command);
    if (command.type === "RequestUnitState") this.applyUnitTransition(command);
    if (command.type === "BuyReplacementEnergy") {
      const result = buyReplacementEnergy(this.world, command);
      this.world = result.world;
      generatedEvents = result.events;
    }
    if (command.type === "ScheduleMaintenance") this.applyScheduleMaintenance(command);
    if (command.type === "AssignTeam") this.applyAssignTeam(command);
    if (command.type === "CancelMaintenance") {
      const result = cancelMaintenance(this.world, command);
      this.world = result.world;
      generatedEvents = result.events;
    }
    if (command.type === "CompleteMaintenanceReturnCheck") {
      const result = completeMaintenanceReturnCheck(this.world, command);
      this.world = result.world;
      generatedEvents = result.events;
    }
    this.record({
      kind: "command-executed",
      id: command.id,
      type: command.type
    });
    this.emitEvents(generatedEvents);

    const maintenance = applyMaintenanceBoundaries(this.world);
    this.world = maintenance.world;
    this.emitEvents(maintenance.events);

    const scenario = applyScenarioBoundaries(this.world);
    this.world = scenario.world;
    this.emitEvents(scenario.events);
  }

  private applyDelegationPolicy(command: SetDelegationPolicyCommand): void {
    this.world = {
      ...this.world,
      policies: {
        ...this.world.policies,
        [command.payload.policyId]: {
          id: command.payload.policyId,
          enabled: command.payload.enabled
        }
      }
    };
  }

  private applyPowerSchedule(command: SetPowerScheduleCommand): void {
    this.world = updateProductionUnit(
      this.world,
      command.targetId,
      (unit) => setUnitPowerSchedule(unit, command.payload.points, this.world.simTimeSec)
    );
  }

  private applyUnitTransition(command: RequestUnitStateCommand): void {
    this.world = updateProductionUnit(
      this.world,
      command.targetId,
      (unit) => startUnitTransition(unit, command.payload.state, this.world.simTimeSec)
    );
  }

  private applyScheduleMaintenance(command: ScheduleMaintenanceCommand): void {
    this.world = scheduleMaintenance(this.world, command);
  }

  private applyAssignTeam(command: AssignTeamCommand): void {
    this.world = assignMaintenanceTeam(this.world, command);
  }

  private setSimTime(simTimeSec: SimSeconds): void {
    const fromSec = this.world.simTimeSec;
    const generatedBeforeMwh = totalGeneratedMwh(this.world);
    this.world = advanceProductionTo(this.world, simTimeSec);
    const generatedAfterMwh = totalGeneratedMwh(this.world);
    this.world = accumulateDeliveryGeneration(
      this.world,
      fromSec,
      simTimeSec,
      Math.max(0, generatedAfterMwh - generatedBeforeMwh)
    );
    this.world = advanceMaintenanceUsage(this.world, fromSec, simTimeSec);
  }

  private emitEvents(events: readonly GameEvent[]): string | undefined {
    let importantEventId: string | undefined;
    for (const event of events) {
      const cloned = cloneValue(event);
      this.executedEvents.push(cloned);
      this.record({
        kind: "event",
        id: cloned.id,
        type: cloned.type
      });
      if (!importantEventId && isImportantEvent(cloned)) importantEventId = cloned.id;
    }
    return importantEventId;
  }

  private syncFutureEvents(): void {
    this.world = {
      ...this.world,
      futureEvents: this.eventQueue.snapshot().map((entry) => cloneValue(entry.value))
    };
  }

  private record(
    entry:
      | Omit<Extract<EngineJournalEntry, { kind: "command-executed" }>, "sequence" | "atSec">
      | Omit<Extract<EngineJournalEntry, { kind: "command-rejected" }>, "sequence" | "atSec">
      | Omit<Extract<EngineJournalEntry, { kind: "event" }>, "sequence" | "atSec">
      | Omit<Extract<EngineJournalEntry, { kind: "advance-stopped" }>, "sequence" | "atSec">
  ): void {
    this.journalSequence += 1;
    this.journalEntries.push({
      ...entry,
      sequence: this.journalSequence,
      atSec: this.world.simTimeSec
    } as EngineJournalEntry);
  }
}
