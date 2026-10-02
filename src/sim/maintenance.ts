import type {
  AssignTeamCommand,
  CancelMaintenanceCommand,
  CompleteMaintenanceReturnCheckCommand,
  RejectionCode,
  ScheduleMaintenanceCommand
} from "../contracts/commands.js";
import { baseEventFields, type GameEvent } from "../contracts/events.js";
import type {
  EquipmentCondition,
  MaintenanceSkill,
  MaintenanceTaskKind,
  MaintenanceTaskState
} from "../contracts/maintenance.js";
import type { ProductionFunctionalGroupKind, ProductionUnitState } from "../contracts/production.js";
import type { AssetState, PlayerObservation, WorldState } from "../contracts/world.js";
import type { SimSeconds } from "../contracts/units.js";

export interface MaintenanceProposal {
  readonly taskId: string;
  readonly kind: MaintenanceTaskKind;
  readonly targetUnitId: string;
  readonly targetGroup: ProductionFunctionalGroupKind;
  readonly startsAtSec: SimSeconds;
  readonly expectedDurationSec: SimSeconds;
  readonly estimatedCostCents: number;
  readonly reservationCostCents: number;
  readonly estimatedLostGenerationMwh: number;
  readonly requiredSkills: readonly MaintenanceSkill[];
  readonly effectSummary: string;
  readonly unknowns: readonly string[];
}

export interface MaintenanceCommandRejection {
  readonly code: RejectionCode;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface MaintenanceMutation {
  readonly world: WorldState;
  readonly events: readonly GameEvent[];
}

const GROUP_COST_FACTOR: Readonly<Record<ProductionFunctionalGroupKind, number>> = {
  "nuclear-island": 1.5,
  turbine: 1.2,
  generator: 1.1,
  "grid-connection": 1
};

const CRITICALITY_WEAR_FACTOR = {
  low: 0.8,
  medium: 1,
  high: 1.2
} as const;

function equipmentId(unitId: string, group: ProductionFunctionalGroupKind): string {
  return `${unitId}:${group}`;
}

function unit(world: WorldState, id: string): ProductionUnitState | null {
  const asset = world.assets[id];
  return asset?.kind === "production-unit" && asset.productionUnit ? asset.productionUnit : null;
}

function teamAsset(world: WorldState, id: string): AssetState | null {
  const asset = world.assets[id];
  return asset?.kind === "team" && asset.maintenanceTeam ? asset : null;
}

export function requiredSkillsFor(
  kind: MaintenanceTaskKind,
  group: ProductionFunctionalGroupKind
): readonly MaintenanceSkill[] {
  if (kind === "inspection") return ["instrumentation"];
  if (group === "generator" || group === "grid-connection") return ["electrical"];
  return ["mechanical"];
}

export function maintenanceProposal(
  world: WorldState,
  command: ScheduleMaintenanceCommand
): MaintenanceProposal {
  const productionUnit = unit(world, command.targetId);
  if (!productionUnit) throw new Error("MAINTENANCE_TARGET_NOT_PRODUCTION_UNIT");
  const item = world.maintenance.equipment[equipmentId(command.targetId, command.payload.targetGroup)];
  if (!item) throw new Error("MAINTENANCE_EQUIPMENT_UNKNOWN");

  const baseCost = command.payload.kind === "inspection" ? 250_000 : 1_500_000;
  const estimatedCostCents = Math.round(baseCost * GROUP_COST_FACTOR[command.payload.targetGroup]);
  const reservationCostCents = Math.ceil(estimatedCostCents * 0.25);
  const referencePowerMw = Math.max(productionUnit.realizedNetPowerMw, productionUnit.plannedNetPowerMw);
  const estimatedLostGenerationMwh = referencePowerMw * command.payload.expectedDurationSec / 3600;
  const effectSummary = command.payload.kind === "inspection"
    ? "Réduit l'incertitude de diagnostic sans réparer l'équipement."
    : "Corrige un niveau de défaut ciblé et réduit partiellement l'usure sans remettre l'équipement à neuf.";
  const unknowns = item.uncertaintyPct > 0
    ? [`État réel incertain à ${item.uncertaintyPct}% avant inspection.`]
    : [];

  return {
    taskId: command.payload.taskId,
    kind: command.payload.kind,
    targetUnitId: command.targetId,
    targetGroup: command.payload.targetGroup,
    startsAtSec: command.payload.startsAtSec,
    expectedDurationSec: command.payload.expectedDurationSec,
    estimatedCostCents,
    reservationCostCents,
    estimatedLostGenerationMwh,
    requiredSkills: requiredSkillsFor(command.payload.kind, command.payload.targetGroup),
    effectSummary,
    unknowns
  };
}

function hasSkills(asset: AssetState, required: readonly MaintenanceSkill[]): boolean {
  const skills = asset.maintenanceTeam?.skills ?? [];
  return required.every((skill) => skills.includes(skill));
}

export function checkMaintenanceCommand(
  world: WorldState,
  command:
    | ScheduleMaintenanceCommand
    | AssignTeamCommand
    | CancelMaintenanceCommand
    | CompleteMaintenanceReturnCheckCommand
): MaintenanceCommandRejection | null {
  if (command.targetSimTimeSec !== world.simTimeSec) {
    return {
      code: "COMMAND_INVARIANT_VIOLATION",
      parameters: { reason: "maintenance-command-must-execute-at-current-time", now: world.simTimeSec }
    };
  }

  if (command.type === "ScheduleMaintenance") {
    if (!unit(world, command.targetId)) {
      return {
        code: "COMMAND_TARGET_UNKNOWN",
        parameters: { reason: "target-is-not-production-unit", targetId: command.targetId }
      };
    }
    if (world.maintenance.tasks[command.payload.taskId]) {
      return {
        code: "COMMAND_MAINTENANCE_TASK_CONFLICT",
        parameters: { reason: "task-id-already-exists", taskId: command.payload.taskId }
      };
    }
    const id = equipmentId(command.targetId, command.payload.targetGroup);
    if (!world.maintenance.equipment[id]) {
      return {
        code: "COMMAND_TARGET_UNKNOWN",
        parameters: { reason: "maintenance-equipment-unknown", equipmentId: id }
      };
    }
    const proposal = maintenanceProposal(world, command);
    if (world.cashCents < proposal.reservationCostCents) {
      return {
        code: "COMMAND_CASH_INSUFFICIENT",
        parameters: {
          requiredCents: proposal.reservationCostCents,
          availableCents: world.cashCents
        }
      };
    }
    return null;
  }

  const task = world.maintenance.tasks[command.payload.taskId];
  if (!task) {
    return {
      code: "COMMAND_MAINTENANCE_STATE_INVALID",
      parameters: { reason: "task-unknown", taskId: command.payload.taskId }
    };
  }

  if (command.type === "AssignTeam") {
    if (task.status !== "scheduled" && task.status !== "blocked") {
      return {
        code: "COMMAND_MAINTENANCE_STATE_INVALID",
        parameters: { reason: "task-not-assignable", status: task.status }
      };
    }
    const asset = teamAsset(world, command.payload.teamId);
    if (!asset || !asset.maintenanceTeam) {
      return {
        code: "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE",
        parameters: { reason: "team-unknown", teamId: command.payload.teamId }
      };
    }
    if (
      asset.maintenanceTeam.reservedTaskId &&
      asset.maintenanceTeam.reservedTaskId !== task.id
    ) {
      return {
        code: "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE",
        parameters: {
          reason: "team-already-reserved",
          teamId: command.payload.teamId,
          taskId: asset.maintenanceTeam.reservedTaskId
        }
      };
    }
    if (
      !asset.available ||
      (
        asset.maintenanceTeam.unavailableUntilSec !== null &&
        asset.maintenanceTeam.unavailableUntilSec > world.simTimeSec
      )
    ) {
      return {
        code: "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE",
        parameters: {
          reason: "team-temporarily-unavailable",
          teamId: command.payload.teamId,
          unavailableUntilSec: asset.maintenanceTeam.unavailableUntilSec ?? world.simTimeSec
        }
      };
    }
    if (!hasSkills(asset, task.requiredSkills)) {
      return {
        code: "COMMAND_MAINTENANCE_SKILL_MISSING",
        parameters: {
          reason: "team-missing-required-skill",
          teamId: command.payload.teamId,
          requiredSkills: task.requiredSkills.join(",")
        }
      };
    }
    return null;
  }

  if (command.type === "CancelMaintenance") {
    if (task.status !== "scheduled" && task.status !== "blocked") {
      return {
        code: "COMMAND_MAINTENANCE_STATE_INVALID",
        parameters: { reason: "task-cannot-be-cancelled-after-start", status: task.status }
      };
    }
    return null;
  }

  if (task.status !== "awaiting-return-check") {
    return {
      code: "COMMAND_MAINTENANCE_STATE_INVALID",
      parameters: { reason: "return-check-not-due", status: task.status }
    };
  }
  return null;
}

function replaceTeam(
  world: WorldState,
  teamId: string,
  updater: (asset: AssetState) => AssetState
): WorldState {
  const asset = world.assets[teamId];
  if (!asset) throw new Error("MAINTENANCE_TEAM_UNKNOWN");
  return {
    ...world,
    assets: {
      ...world.assets,
      [teamId]: updater(asset)
    }
  };
}

function releaseTeam(world: WorldState, teamId: string | null): WorldState {
  if (!teamId) return world;
  const asset = teamAsset(world, teamId);
  if (!asset || !asset.maintenanceTeam) return world;
  return replaceTeam(world, teamId, (current) => ({
    ...current,
    available: true,
    maintenanceTeam: {
      ...current.maintenanceTeam!,
      reservedTaskId: null,
      unavailableUntilSec: null
    }
  }));
}

function setGroupAvailable(
  world: WorldState,
  unitId: string,
  group: ProductionFunctionalGroupKind,
  available: boolean
): WorldState {
  const asset = world.assets[unitId];
  if (!asset?.productionUnit) return world;
  return {
    ...world,
    assets: {
      ...world.assets,
      [unitId]: {
        ...asset,
        available: available && asset.productionUnit.operatingState !== "forced-outage",
        productionUnit: {
          ...asset.productionUnit,
          groups: {
            ...asset.productionUnit.groups,
            [group]: {
              ...asset.productionUnit.groups[group],
              available
            }
          }
        }
      }
    }
  };
}

function putTask(world: WorldState, task: MaintenanceTaskState): WorldState {
  return {
    ...world,
    maintenance: {
      ...world.maintenance,
      tasks: {
        ...world.maintenance.tasks,
        [task.id]: task
      }
    }
  };
}

export function scheduleMaintenance(
  world: WorldState,
  command: ScheduleMaintenanceCommand
): WorldState {
  const proposal = maintenanceProposal(world, command);
  const task: MaintenanceTaskState = {
    id: proposal.taskId,
    kind: proposal.kind,
    targetUnitId: proposal.targetUnitId,
    targetGroup: proposal.targetGroup,
    startsAtSec: proposal.startsAtSec,
    expectedDurationSec: proposal.expectedDurationSec,
    status: "scheduled",
    requiredSkills: proposal.requiredSkills,
    assignedTeamId: null,
    startedAtSec: null,
    completesAtSec: null,
    estimatedCostCents: proposal.estimatedCostCents,
    committedCostCents: proposal.reservationCostCents,
    estimatedLostGenerationMwh: proposal.estimatedLostGenerationMwh,
    effectSummary: proposal.effectSummary,
    unknowns: proposal.unknowns,
    returnCheckRequired: proposal.kind === "repair",
    blockedReason: null,
    lastEventId: null
  };
  return {
    ...putTask(world, task),
    cashCents: world.cashCents - proposal.reservationCostCents,
    transactions: [
      ...world.transactions,
      {
        id: `maintenance:${task.id}:reservation`,
        atSec: world.simTimeSec,
        kind: "maintenance",
        amountCents: -proposal.reservationCostCents,
        referenceId: task.id
      }
    ]
  };
}

export function assignMaintenanceTeam(
  world: WorldState,
  command: AssignTeamCommand
): WorldState {
  const task = world.maintenance.tasks[command.payload.taskId]!;
  let next = putTask(world, {
    ...task,
    status: task.status === "blocked" ? "scheduled" : task.status,
    startsAtSec: task.status === "blocked" ? world.simTimeSec : task.startsAtSec,
    assignedTeamId: command.payload.teamId,
    blockedReason: null
  });
  next = replaceTeam(next, command.payload.teamId, (asset) => ({
    ...asset,
    available: false,
    maintenanceTeam: {
      ...asset.maintenanceTeam!,
      reservedTaskId: task.id,
      unavailableUntilSec: null
    }
  }));
  return next;
}

export function cancelMaintenance(
  world: WorldState,
  command: CancelMaintenanceCommand
): MaintenanceMutation {
  const task = world.maintenance.tasks[command.payload.taskId]!;
  const id = `maintenance:${task.id}:cancelled:${world.simTimeSec}`;
  let next = putTask(world, {
    ...task,
    status: "cancelled",
    blockedReason: null,
    lastEventId: id
  });
  next = releaseTeam(next, task.assignedTeamId);
  const event: GameEvent = {
    ...baseEventFields(id, world.simTimeSec, [task.targetUnitId], task.lastEventId, "notice"),
    type: "MaintenanceCancelled",
    payload: { taskId: task.id, retainedCostCents: task.committedCostCents }
  };
  return { world: next, events: [event] };
}

function improveCondition(condition: EquipmentCondition): EquipmentCondition {
  if (condition === "faulted") return "degraded";
  if (condition === "degraded") return "healthy";
  return "healthy";
}

export function completeMaintenanceReturnCheck(
  world: WorldState,
  command: CompleteMaintenanceReturnCheckCommand
): MaintenanceMutation {
  const task = world.maintenance.tasks[command.payload.taskId]!;
  const id = `maintenance:${task.id}:return-check:${world.simTimeSec}`;
  let next = setGroupAvailable(world, task.targetUnitId, task.targetGroup, true);
  next = putTask(next, {
    ...task,
    status: "completed",
    blockedReason: null,
    lastEventId: id
  });
  next = releaseTeam(next, task.assignedTeamId);
  const event: GameEvent = {
    ...baseEventFields(id, world.simTimeSec, [task.targetUnitId], task.lastEventId, "notice"),
    type: "MaintenanceReturnCheckCompleted",
    payload: { taskId: task.id }
  };
  return { world: next, events: [event] };
}

function startTask(world: WorldState, task: MaintenanceTaskState): MaintenanceMutation {
  if (!task.assignedTeamId) {
    const id = `maintenance:${task.id}:blocked:${world.simTimeSec}`;
    const blocked = {
      ...task,
      status: "blocked" as const,
      blockedReason: "missing-team",
      lastEventId: id
    };
    const event: GameEvent = {
      ...baseEventFields(id, world.simTimeSec, [task.targetUnitId], task.lastEventId, "warning"),
      type: "MaintenanceBlocked",
      payload: { taskId: task.id, reason: "missing-team" }
    };
    return { world: putTask(world, blocked), events: [event] };
  }

  const remainingCostCents = task.estimatedCostCents - task.committedCostCents;
  if (world.cashCents < remainingCostCents) {
    const id = `maintenance:${task.id}:blocked-cash:${world.simTimeSec}`;
    let next = putTask(world, {
      ...task,
      status: "blocked",
      assignedTeamId: null,
      blockedReason: "insufficient-cash-at-start",
      lastEventId: id
    });
    next = releaseTeam(next, task.assignedTeamId);
    const event: GameEvent = {
      ...baseEventFields(id, world.simTimeSec, [task.targetUnitId], task.lastEventId, "warning"),
      type: "MaintenanceBlocked",
      payload: { taskId: task.id, reason: "insufficient-cash-at-start" }
    };
    return { world: next, events: [event] };
  }

  const completesAtSec = world.simTimeSec + task.expectedDurationSec;
  const id = `maintenance:${task.id}:started:${world.simTimeSec}`;
  let next: WorldState = {
    ...world,
    cashCents: world.cashCents - remainingCostCents,
    transactions: [
      ...world.transactions,
      {
        id: `maintenance:${task.id}:execution`,
        atSec: world.simTimeSec,
        kind: "maintenance",
        amountCents: -remainingCostCents,
        referenceId: task.id
      }
    ]
  };
  next = setGroupAvailable(next, task.targetUnitId, task.targetGroup, false);
  next = putTask(next, {
    ...task,
    status: "in-progress",
    startedAtSec: world.simTimeSec,
    completesAtSec,
    committedCostCents: task.estimatedCostCents,
    blockedReason: null,
    lastEventId: id
  });
  next = replaceTeam(next, task.assignedTeamId, (asset) => ({
    ...asset,
    available: false,
    maintenanceTeam: {
      ...asset.maintenanceTeam!,
      reservedTaskId: task.id,
      unavailableUntilSec: completesAtSec
    }
  }));
  const event: GameEvent = {
    ...baseEventFields(id, world.simTimeSec, [task.targetUnitId, task.assignedTeamId], task.lastEventId, "notice"),
    type: "MaintenanceStarted",
    payload: {
      taskId: task.id,
      kind: task.kind,
      group: task.targetGroup,
      committedCostCents: task.estimatedCostCents
    }
  };
  return { world: next, events: [event] };
}

function completeTask(world: WorldState, task: MaintenanceTaskState): MaintenanceMutation {
  const equipmentKey = equipmentId(task.targetUnitId, task.targetGroup);
  const equipment = world.maintenance.equipment[equipmentKey]!;
  if (task.kind === "inspection") {
    const id = `maintenance:${task.id}:inspection-completed:${world.simTimeSec}`;
    const nextEquipment = {
      ...equipment,
      estimatedCondition: equipment.actualCondition,
      uncertaintyPct: 5,
      lastInspectionAtSec: world.simTimeSec
    };
    let next: WorldState = {
      ...world,
      maintenance: {
        ...world.maintenance,
        equipment: {
          ...world.maintenance.equipment,
          [equipmentKey]: nextEquipment
        },
        tasks: {
          ...world.maintenance.tasks,
          [task.id]: {
            ...task,
            status: "completed",
            blockedReason: null,
            lastEventId: id
          }
        }
      }
    };
    next = setGroupAvailable(next, task.targetUnitId, task.targetGroup, true);
    next = releaseTeam(next, task.assignedTeamId);
    const event: GameEvent = {
      ...baseEventFields(id, world.simTimeSec, [task.targetUnitId], task.lastEventId, "notice"),
      type: "InspectionCompleted",
      payload: { taskId: task.id, equipmentId: equipmentKey, uncertaintyPct: 5 }
    };
    return { world: next, events: [event] };
  }

  const id = `maintenance:${task.id}:repair-completed:${world.simTimeSec}`;
  const repairedCondition = improveCondition(equipment.actualCondition);
  const nextEquipment = {
    ...equipment,
    actualCondition: repairedCondition,
    estimatedCondition: repairedCondition,
    uncertaintyPct: 15,
    wearBasisPoints: Math.max(0, equipment.wearBasisPoints - 1500)
  };
  const next: WorldState = {
    ...world,
    maintenance: {
      ...world.maintenance,
      equipment: {
        ...world.maintenance.equipment,
        [equipmentKey]: nextEquipment
      },
      tasks: {
        ...world.maintenance.tasks,
        [task.id]: {
          ...task,
          status: "awaiting-return-check",
          completesAtSec: world.simTimeSec,
          blockedReason: null,
          lastEventId: id
        }
      }
    },
    assets: {
      ...world.assets,
      [task.assignedTeamId!]: {
        ...world.assets[task.assignedTeamId!]!,
        available: false,
        maintenanceTeam: {
          ...world.assets[task.assignedTeamId!]!.maintenanceTeam!,
          reservedTaskId: task.id,
          unavailableUntilSec: null
        }
      }
    }
  };
  const event: GameEvent = {
    ...baseEventFields(id, world.simTimeSec, [task.targetUnitId, task.assignedTeamId!], task.lastEventId, "notice"),
    type: "RepairCompleted",
    payload: {
      taskId: task.id,
      equipmentId: equipmentKey,
      effect: "targeted-condition-improved-one-level;wear-partially-reduced",
      returnCheckRequired: true
    }
  };
  return { world: next, events: [event] };
}

export function nextMaintenanceBoundaryAt(world: WorldState): SimSeconds | null {
  let next = Number.POSITIVE_INFINITY;
  for (const task of Object.values(world.maintenance.tasks)) {
    if (task.status === "scheduled") {
      next = Math.min(next, Math.max(task.startsAtSec, world.simTimeSec));
    }
    if (task.status === "in-progress" && task.completesAtSec !== null) {
      next = Math.min(next, task.completesAtSec);
    }
  }
  return Number.isFinite(next) ? next : null;
}

export function applyMaintenanceBoundaries(world: WorldState): MaintenanceMutation {
  let next = world;
  const events: GameEvent[] = [];
  for (const taskId of Object.keys(next.maintenance.tasks).sort()) {
    const task = next.maintenance.tasks[taskId]!;
    if (task.status === "scheduled" && task.startsAtSec <= next.simTimeSec) {
      const result = startTask(next, task);
      next = result.world;
      events.push(...result.events);
      continue;
    }
    const current = next.maintenance.tasks[taskId]!;
    if (
      current.status === "in-progress" &&
      current.completesAtSec !== null &&
      current.completesAtSec <= next.simTimeSec
    ) {
      const result = completeTask(next, current);
      next = result.world;
      events.push(...result.events);
    }
  }
  return { world: next, events };
}

function conditionFromWear(wearBasisPoints: number): EquipmentCondition {
  if (wearBasisPoints >= 9000) return "faulted";
  if (wearBasisPoints >= 7000) return "degraded";
  return "healthy";
}

function conditionRank(condition: EquipmentCondition): number {
  if (condition === "faulted") return 2;
  if (condition === "degraded") return 1;
  return 0;
}

function worsenedCondition(current: EquipmentCondition, wearBasisPoints: number): EquipmentCondition {
  const fromWear = conditionFromWear(wearBasisPoints);
  return conditionRank(fromWear) > conditionRank(current) ? fromWear : current;
}

export function advanceMaintenanceUsage(
  world: WorldState,
  fromSec: SimSeconds,
  toSec: SimSeconds
): WorldState {
  if (toSec <= fromSec) return world;
  const wearQuantumSec = 300;
  const elapsedQuanta = Math.floor(toSec / wearQuantumSec) - Math.floor(fromSec / wearQuantumSec);
  if (elapsedQuanta <= 0) return world;

  let next = world;
  for (const [id, item] of Object.entries(world.maintenance.equipment)) {
    const productionUnit = unit(world, item.unitId);
    if (!productionUnit) continue;
    const loadFactor = productionUnit.nominalNetPowerMw > 0
      ? productionUnit.realizedNetPowerMw / productionUnit.nominalNetPowerMw
      : 0;
    const cycleFactor = 1 + Math.min(item.cycleCount, 100) / 200;
    const criticalityFactor = CRITICALITY_WEAR_FACTOR[item.criticality];
    const wearPerQuantum = Math.max(
      1,
      Math.round(((4 + 18 * loadFactor) * cycleFactor * criticalityFactor) / 12)
    );
    const wearDelta = elapsedQuanta * wearPerQuantum;
    const wearBasisPoints = Math.min(10_000, item.wearBasisPoints + wearDelta);
    const actualCondition = worsenedCondition(item.actualCondition, wearBasisPoints);
    next = {
      ...next,
      maintenance: {
        ...next.maintenance,
        equipment: {
          ...next.maintenance.equipment,
          [id]: { ...item, wearBasisPoints, actualCondition }
        }
      }
    };
    if (actualCondition === "faulted") {
      next = setGroupAvailable(next, item.unitId, item.group, false);
    }
  }
  return next;
}

export function maintenanceObservation(world: WorldState): PlayerObservation["maintenance"] {
  const tasks = Object.fromEntries(
    Object.entries(world.maintenance.tasks).map(([id, task]) => [
      id,
      {
        ...task,
        committedCostCents: {
          confidence: "known" as const,
          value: task.committedCostCents,
          observedAtSec: world.simTimeSec
        }
      }
    ])
  );
  const equipment = Object.fromEntries(
    Object.entries(world.maintenance.equipment).map(([id, item]) => [
      id,
      {
        id: item.id,
        unitId: item.unitId,
        group: item.group,
        estimatedCondition: item.estimatedCondition,
        uncertaintyPct: item.uncertaintyPct,
        criticality: item.criticality,
        wearBasisPoints: item.wearBasisPoints,
        cycleCount: item.cycleCount,
        lastInspectionAtSec: item.lastInspectionAtSec
      }
    ])
  );
  return { tasks, equipment };
}
