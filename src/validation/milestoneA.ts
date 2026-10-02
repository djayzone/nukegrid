import type { CommandResult, GameCommand } from "../contracts/commands.js";
import { baseCommandFields, command } from "../contracts/commands.js";
import type { PlayerObservation, WorldState } from "../contracts/world.js";
import { validateWorldState } from "../contracts/validation.js";
import { valmorneWorld } from "../content/valmorne.js";
import {
  createSaveFromSnapshot,
  engineSnapshotFromSave,
  validateSave,
  type SaveFile
} from "../persistence/save.js";
import { DeterministicEngine } from "../sim/engine.js";

export const MILESTONE_A_VERSION = "0.8.0-l08" as const;

export const MILESTONE_A_POLICIES = [
  "prudent",
  "productive",
  "maintenance-opportuniste"
] as const;
export type MilestoneAPolicy = typeof MILESTONE_A_POLICIES[number];

export const MILESTONE_A_VARIANTS = [
  "reference",
  "delivery-pressure",
  "maintenance-pressure"
] as const;
export type MilestoneAVariant = typeof MILESTONE_A_VARIANTS[number];

export const MILESTONE_A_SEEDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => 8_000 + index)
);

const CHECKPOINTS_SEC = [
  0,
  900,
  2700,
  18_000,
  21_600,
  25_200,
  36_000,
  43_200,
  46_800,
  54_000,
  64_800,
  86_400
] as const;

export type MilestoneAction =
  | {
      readonly type: "request-unit-state";
      readonly unitId: string;
      readonly state: "start-preparation" | "producing";
    }
  | {
      readonly type: "set-power";
      readonly unitId: string;
      readonly powerMw: number;
    }
  | {
      readonly type: "maintenance";
      readonly taskId: string;
      readonly unitId: string;
      readonly group: "turbine" | "generator";
      readonly kind: "inspection" | "repair";
      readonly durationSec: number;
      readonly teamId: string;
    }
  | {
      readonly type: "return-check";
      readonly taskId: string;
      readonly unitId: string;
    }
  | {
      readonly type: "buy-replacement";
      readonly contractId: string;
      readonly powerMw: number;
      readonly maxPriceEurPerMwh: number;
    };

export interface MilestoneDecision {
  readonly atSec: number;
  readonly action: MilestoneAction["type"];
  readonly target: string;
  readonly acceptedCommandIds: readonly string[];
}

export interface MilestoneRunMetrics {
  readonly finalCashCents: number;
  readonly operatingResultCents: number;
  readonly totalGeneratedMwh: number;
  readonly faultedEquipment: number;
  readonly completedMaintenanceTasks: number;
  readonly avoidedIncidents: number;
  readonly transactionCount: number;
  readonly commandCount: number;
  readonly rejectedCommands: number;
  readonly lostAcceptedCommands: number;
  readonly longestQuietWindowSec: number;
  readonly maxAlertGroupSize: number;
  readonly debriefReady: boolean;
  readonly worldValid: boolean;
  readonly cashReconciles: boolean;
}

export interface MilestoneRunResult {
  readonly policy: MilestoneAPolicy;
  readonly variant: MilestoneAVariant;
  readonly seed: number;
  readonly decisions: readonly MilestoneDecision[];
  readonly metrics: MilestoneRunMetrics;
  readonly finalSave: SaveFile;
}

function cloneWorld(): WorldState {
  return structuredClone(valmorneWorld);
}

export function milestoneVariantWorld(variant: MilestoneAVariant): WorldState {
  const base = cloneWorld();
  if (variant === "reference") return base;

  if (variant === "delivery-pressure") {
    const midday = base.economy.deliveryContracts["delivery-valmorne-midday"]!;
    const evening = base.economy.deliveryContracts["delivery-valmorne-evening"]!;
    return {
      ...base,
      economy: {
        ...base.economy,
        deliveryContracts: {
          ...base.economy.deliveryContracts,
          [midday.id]: { ...midday, committedPowerMw: 600 },
          [evening.id]: { ...evening, committedPowerMw: 650 }
        }
      }
    };
  }

  const turbine = base.maintenance.equipment["unit-valmorne-1:turbine"]!;
  const generator = base.maintenance.equipment["unit-valmorne-2:generator"]!;
  return {
    ...base,
    maintenance: {
      ...base.maintenance,
      equipment: {
        ...base.maintenance.equipment,
        [turbine.id]: {
          ...turbine,
          wearBasisPoints: 8_800,
          actualCondition: "degraded",
          estimatedCondition: "degraded",
          uncertaintyPct: 10
        },
        [generator.id]: {
          ...generator,
          wearBasisPoints: 8_700,
          actualCondition: "degraded",
          estimatedCondition: "degraded",
          uncertaintyPct: 10
        }
      }
    }
  };
}

function awaitingReturnChecks(observation: PlayerObservation): MilestoneAction[] {
  return Object.values(observation.maintenance.tasks)
    .filter((task) => task.status === "awaiting-return-check")
    .map((task) => ({
      type: "return-check" as const,
      taskId: task.id,
      unitId: task.targetUnitId
    }));
}

/**
 * Reference strategies are deliberately observation-only. They never receive
 * WorldState, PRNG state, future events or actual hidden equipment condition.
 */
export function milestonePolicyActions(
  policy: MilestoneAPolicy,
  observation: PlayerObservation
): readonly MilestoneAction[] {
  const now = observation.simTimeSec;
  const actions: MilestoneAction[] = [...awaitingReturnChecks(observation)];

  if (now === 0) {
    actions.push(
      { type: "request-unit-state", unitId: "unit-valmorne-1", state: "start-preparation" },
      { type: "request-unit-state", unitId: "unit-valmorne-2", state: "start-preparation" }
    );
  }

  if (now === 900) {
    actions.push(
      { type: "request-unit-state", unitId: "unit-valmorne-1", state: "producing" },
      { type: "request-unit-state", unitId: "unit-valmorne-2", state: "producing" }
    );
  }

  if (now === 2700) {
    const powers = policy === "productive"
      ? [900, 850]
      : policy === "prudent"
        ? [650, 600]
        : [750, 700];
    actions.push(
      { type: "set-power", unitId: "unit-valmorne-1", powerMw: powers[0]! },
      { type: "set-power", unitId: "unit-valmorne-2", powerMw: powers[1]! }
    );
    if (policy === "prudent") {
      actions.push({
        type: "buy-replacement",
        contractId: "delivery-valmorne-day-1",
        powerMw: 300,
        maxPriceEurPerMwh: 180
      });
    }
    if (policy === "maintenance-opportuniste") {
      actions.push({
        type: "buy-replacement",
        contractId: "delivery-valmorne-day-1",
        powerMw: 150,
        maxPriceEurPerMwh: 180
      });
    }
  }

  if (now === 18_000) {
    if (policy === "prudent") {
      actions.push({
        type: "maintenance",
        taskId: "l08-prudent-v1-turbine",
        unitId: "unit-valmorne-1",
        group: "turbine",
        kind: "repair",
        durationSec: 3600,
        teamId: "team-valmorne-a"
      });
    }
    if (policy === "maintenance-opportuniste") {
      actions.push({
        type: "maintenance",
        taskId: "l08-opportuniste-v1-inspection",
        unitId: "unit-valmorne-1",
        group: "turbine",
        kind: "inspection",
        durationSec: 1800,
        teamId: "team-valmorne-b"
      });
    }
  }

  if (now === 21_600 && policy === "maintenance-opportuniste") {
    const turbine = observation.maintenance.equipment["unit-valmorne-1:turbine"];
    if (turbine?.estimatedCondition === "degraded" || turbine?.estimatedCondition === "faulted") {
      actions.push({
        type: "maintenance",
        taskId: "l08-opportuniste-v1-repair",
        unitId: "unit-valmorne-1",
        group: "turbine",
        kind: "repair",
        durationSec: 3600,
        teamId: "team-valmorne-a"
      });
    }
  }

  if (now === 25_200 && policy !== "productive") {
    const generator = observation.maintenance.equipment["unit-valmorne-2:generator"];
    actions.push({
      type: "maintenance",
      taskId: policy === "prudent"
        ? "l08-prudent-v2-generator"
        : "l08-opportuniste-v2-generator",
      unitId: "unit-valmorne-2",
      group: "generator",
      kind: policy === "maintenance-opportuniste" && generator?.estimatedCondition === "degraded"
        ? "repair"
        : "inspection",
      durationSec: 10_800,
      teamId: "team-valmorne-b"
    });
  }

  if (now === 46_800) {
    if (policy === "prudent") {
      actions.push({
        type: "buy-replacement",
        contractId: "delivery-valmorne-evening",
        powerMw: 250,
        maxPriceEurPerMwh: 180
      });
    }
    if (policy === "maintenance-opportuniste") {
      actions.push({
        type: "buy-replacement",
        contractId: "delivery-valmorne-evening",
        powerMw: 200,
        maxPriceEurPerMwh: 180
      });
    }
  }

  return actions;
}

function accepted(result: CommandResult): boolean {
  return result.status === "accepted" || result.status === "adjusted";
}

function totalGeneration(observation: PlayerObservation): number {
  return Object.values(observation.visibleAssets)
    .reduce((sum, asset) => sum + (asset.productionUnit?.generatedMwh.value ?? 0), 0);
}

function maxAlertGroupSize(observation: PlayerObservation): number {
  return observation.scenario.alertGroups.reduce(
    (maximum, group) => Math.max(maximum, new Set(group.incidentIds).size),
    0
  );
}

function longestQuietWindow(decisions: readonly MilestoneDecision[]): number {
  const times = [...new Set(decisions.map((decision) => decision.atSec))].sort((a, b) => a - b);
  const bounded = [0, ...times, 86_400];
  let longest = 0;
  for (let index = 1; index < bounded.length; index += 1) {
    longest = Math.max(longest, bounded[index]! - bounded[index - 1]!);
  }
  return longest;
}

function commandId(
  policy: MilestoneAPolicy,
  variant: MilestoneAVariant,
  seed: number,
  sequence: number,
  type: string
): string {
  return `l08:${policy}:${variant}:${seed}:${String(sequence).padStart(3, "0")}:${type}`;
}

interface SubmitContext {
  readonly policy: MilestoneAPolicy;
  readonly variant: MilestoneAVariant;
  readonly seed: number;
  sequence: number;
  readonly acceptedIds: string[];
  rejected: number;
}

function submitCommand(
  engine: DeterministicEngine,
  ctx: SubmitContext,
  gameCommand: GameCommand
): CommandResult {
  const result = engine.submit(gameCommand);
  if (accepted(result)) ctx.acceptedIds.push(result.commandId);
  else ctx.rejected += 1;
  return result;
}

function executeAction(
  engine: DeterministicEngine,
  ctx: SubmitContext,
  action: MilestoneAction
): MilestoneDecision {
  const now = engine.simTimeSec;
  const acceptedIds: string[] = [];
  const nextId = (kind: string) => {
    ctx.sequence += 1;
    return commandId(ctx.policy, ctx.variant, ctx.seed, ctx.sequence, kind);
  };

  if (action.type === "request-unit-state") {
    const id = nextId(action.type);
    const result = submitCommand(engine, ctx, command({
      ...baseCommandFields(id, "validation-policy", action.unitId, now),
      type: "RequestUnitState",
      payload: { state: action.state }
    }));
    if (accepted(result)) acceptedIds.push(id);
  }

  if (action.type === "set-power") {
    const id = nextId(action.type);
    const result = submitCommand(engine, ctx, command({
      ...baseCommandFields(id, "validation-policy", action.unitId, now),
      type: "SetPowerSchedule",
      payload: { points: [{ atSec: now, netPowerMw: action.powerMw }] }
    }));
    if (accepted(result)) acceptedIds.push(id);
  }

  if (action.type === "maintenance") {
    const scheduleId = nextId("schedule-maintenance");
    const scheduled = submitCommand(engine, ctx, command({
      ...baseCommandFields(scheduleId, "validation-policy", action.unitId, now),
      type: "ScheduleMaintenance",
      payload: {
        taskId: action.taskId,
        kind: action.kind,
        targetGroup: action.group,
        startsAtSec: now,
        expectedDurationSec: action.durationSec
      }
    }));
    if (accepted(scheduled)) {
      acceptedIds.push(scheduleId);
      const assignId = nextId("assign-team");
      const assigned = submitCommand(engine, ctx, command({
        ...baseCommandFields(assignId, "validation-policy", action.teamId, now),
        type: "AssignTeam",
        payload: { teamId: action.teamId, taskId: action.taskId }
      }));
      if (accepted(assigned)) acceptedIds.push(assignId);
    }
  }

  if (action.type === "return-check") {
    const id = nextId(action.type);
    const result = submitCommand(engine, ctx, command({
      ...baseCommandFields(id, "validation-policy", action.unitId, now),
      type: "CompleteMaintenanceReturnCheck",
      payload: { taskId: action.taskId }
    }));
    if (accepted(result)) acceptedIds.push(id);
  }

  if (action.type === "buy-replacement") {
    const observation = engine.observation();
    const commitment = observation.economy.commitments.find(
      (candidate) => candidate.id === action.contractId
    );
    if (commitment && !commitment.settled && now < commitment.deliveryEndSec) {
      const id = nextId(action.type);
      const result = submitCommand(engine, ctx, command({
        ...baseCommandFields(id, "validation-policy", "connection-valmorne", now),
        type: "BuyReplacementEnergy",
        payload: {
          contractId: commitment.id,
          deliveryStartSec: Math.max(now, commitment.deliveryStartSec),
          deliveryEndSec: commitment.deliveryEndSec,
          powerMw: action.powerMw,
          maxPriceEurPerMwh: action.maxPriceEurPerMwh
        }
      }));
      if (accepted(result)) acceptedIds.push(id);
    }
  }

  return {
    atSec: now,
    action: action.type,
    target: action.type === "buy-replacement"
      ? action.contractId
      : action.type === "maintenance" || action.type === "return-check" || action.type === "set-power" || action.type === "request-unit-state"
        ? action.unitId
        : "plant-valmorne",
    acceptedCommandIds: acceptedIds
  };
}

export function runMilestoneASession(
  policy: MilestoneAPolicy,
  variant: MilestoneAVariant,
  seed: number,
  options: { readonly restoreAtSec?: number } = {}
): MilestoneRunResult {
  let engine = new DeterministicEngine(milestoneVariantWorld(variant), seed);
  const ctx: SubmitContext = {
    policy,
    variant,
    seed,
    sequence: 0,
    acceptedIds: [],
    rejected: 0
  };
  const decisions: MilestoneDecision[] = [];
  let restored = false;

  for (const checkpoint of CHECKPOINTS_SEC) {
    if (checkpoint > engine.simTimeSec) {
      engine.advanceUntil(checkpoint, { stopOnImportantEvent: false });
    }

    if (
      options.restoreAtSec !== undefined &&
      checkpoint === options.restoreAtSec &&
      !restored
    ) {
      const save = createSaveFromSnapshot(engine.snapshot(), ctx.sequence);
      const validation = validateSave(save);
      if (!validation.ok) throw new Error("L08_RESTORE_CHECKPOINT_SAVE_INVALID");
      engine = DeterministicEngine.restore(engineSnapshotFromSave(save));
      restored = true;
    }

    const observation = engine.observation();
    for (const action of milestonePolicyActions(policy, observation)) {
      decisions.push(executeAction(engine, ctx, action));
    }
  }

  if (engine.simTimeSec < 86_400) {
    engine.advanceUntil(86_400, { stopOnImportantEvent: false });
  }

  const finalWorld = engine.worldState();
  const observation = engine.observation();
  const validation = validateWorldState(finalWorld);
  const transactionTotal = finalWorld.transactions.reduce(
    (sum, transaction) => sum + transaction.amountCents,
    0
  );
  const finalSave = createSaveFromSnapshot(engine.snapshot(), ctx.sequence);
  const processed = new Set(finalWorld.processedCommandIds);
  const lostAcceptedCommands = ctx.acceptedIds.filter((id) => !processed.has(id)).length;

  const metrics: MilestoneRunMetrics = {
    finalCashCents: finalWorld.cashCents,
    operatingResultCents: observation.economy.kpis.operatingResultCents.value,
    totalGeneratedMwh: totalGeneration(observation),
    faultedEquipment: Object.values(finalWorld.maintenance.equipment)
      .filter((item) => item.actualCondition === "faulted").length,
    completedMaintenanceTasks: Object.values(finalWorld.maintenance.tasks)
      .filter((task) => task.status === "completed").length,
    avoidedIncidents: Object.values(finalWorld.scenario.incidents)
      .filter((incident) => incident.avoidedBy !== null).length,
    transactionCount: finalWorld.transactions.length,
    commandCount: ctx.acceptedIds.length + ctx.rejected,
    rejectedCommands: ctx.rejected,
    lostAcceptedCommands,
    longestQuietWindowSec: longestQuietWindow(decisions),
    maxAlertGroupSize: maxAlertGroupSize(observation),
    debriefReady: observation.scenario.debrief?.ready === true,
    worldValid: validation.ok,
    cashReconciles: (
      finalWorld.economy.openingCashCents + transactionTotal === finalWorld.cashCents
    )
  };

  return { policy, variant, seed, decisions, metrics, finalSave };
}

export interface MilestoneMatrixSummary {
  readonly sessions: number;
  readonly policies: readonly MilestoneAPolicy[];
  readonly variants: readonly MilestoneAVariant[];
  readonly seeds: number;
  readonly byPolicyVariant: Readonly<Record<string, {
    readonly runs: number;
    readonly minCashCents: number;
    readonly maxCashCents: number;
    readonly minGeneratedMwh: number;
    readonly maxGeneratedMwh: number;
    readonly maxFaultedEquipment: number;
    readonly maxRejectedCommands: number;
  }>>;
}

export function runMilestoneAMatrix(): {
  readonly results: readonly MilestoneRunResult[];
  readonly summary: MilestoneMatrixSummary;
} {
  const results: MilestoneRunResult[] = [];
  for (const policy of MILESTONE_A_POLICIES) {
    for (const variant of MILESTONE_A_VARIANTS) {
      for (const seed of MILESTONE_A_SEEDS) {
        results.push(runMilestoneASession(policy, variant, seed));
      }
    }
  }

  const byPolicyVariant: Record<string, {
    runs: number;
    minCashCents: number;
    maxCashCents: number;
    minGeneratedMwh: number;
    maxGeneratedMwh: number;
    maxFaultedEquipment: number;
    maxRejectedCommands: number;
  }> = {};

  for (const result of results) {
    const key = `${result.policy}/${result.variant}`;
    const current = byPolicyVariant[key] ?? {
      runs: 0,
      minCashCents: Number.POSITIVE_INFINITY,
      maxCashCents: Number.NEGATIVE_INFINITY,
      minGeneratedMwh: Number.POSITIVE_INFINITY,
      maxGeneratedMwh: Number.NEGATIVE_INFINITY,
      maxFaultedEquipment: 0,
      maxRejectedCommands: 0
    };
    current.runs += 1;
    current.minCashCents = Math.min(current.minCashCents, result.metrics.finalCashCents);
    current.maxCashCents = Math.max(current.maxCashCents, result.metrics.finalCashCents);
    current.minGeneratedMwh = Math.min(current.minGeneratedMwh, result.metrics.totalGeneratedMwh);
    current.maxGeneratedMwh = Math.max(current.maxGeneratedMwh, result.metrics.totalGeneratedMwh);
    current.maxFaultedEquipment = Math.max(
      current.maxFaultedEquipment,
      result.metrics.faultedEquipment
    );
    current.maxRejectedCommands = Math.max(
      current.maxRejectedCommands,
      result.metrics.rejectedCommands
    );
    byPolicyVariant[key] = current;
  }

  return {
    results,
    summary: {
      sessions: results.length,
      policies: MILESTONE_A_POLICIES,
      variants: MILESTONE_A_VARIANTS,
      seeds: MILESTONE_A_SEEDS.length,
      byPolicyVariant
    }
  };
}

function paretoDominates(a: MilestoneRunMetrics, b: MilestoneRunMetrics): boolean {
  const noWorse =
    a.finalCashCents >= b.finalCashCents &&
    a.totalGeneratedMwh >= b.totalGeneratedMwh &&
    a.faultedEquipment <= b.faultedEquipment &&
    a.rejectedCommands <= b.rejectedCommands;
  const strictlyBetter =
    a.finalCashCents > b.finalCashCents ||
    a.totalGeneratedMwh > b.totalGeneratedMwh ||
    a.faultedEquipment < b.faultedEquipment ||
    a.rejectedCommands < b.rejectedCommands;
  return noWorse && strictlyBetter;
}

export function policyDominatesEveryVariant(
  candidate: MilestoneAPolicy,
  results: readonly MilestoneRunResult[]
): boolean {
  return MILESTONE_A_VARIANTS.every((variant) => {
    const candidateRun = results.find(
      (result) =>
        result.policy === candidate &&
        result.variant === variant &&
        result.seed === MILESTONE_A_SEEDS[0]
    );
    if (!candidateRun) return false;
    return MILESTONE_A_POLICIES
      .filter((policy) => policy !== candidate)
      .every((other) => {
        const otherRun = results.find(
          (result) =>
            result.policy === other &&
            result.variant === variant &&
            result.seed === MILESTONE_A_SEEDS[0]
        );
        return otherRun ? paretoDominates(candidateRun.metrics, otherRun.metrics) : false;
      });
  });
}
