import type { EntityId } from "./commands.js";
import type { ProductionFunctionalGroupKind } from "./production.js";
import type { MoneyCents, SimSeconds } from "./units.js";

export const MAINTENANCE_SKILLS = ["mechanical", "electrical", "instrumentation"] as const;
export type MaintenanceSkill = typeof MAINTENANCE_SKILLS[number];

export const MAINTENANCE_TASK_KINDS = ["inspection", "repair"] as const;
export type MaintenanceTaskKind = typeof MAINTENANCE_TASK_KINDS[number];

export const EQUIPMENT_CONDITIONS = ["healthy", "degraded", "faulted"] as const;
export type EquipmentCondition = typeof EQUIPMENT_CONDITIONS[number];

export type MaintenanceCriticality = "low" | "medium" | "high";
export type MaintenanceTaskStatus =
  | "scheduled"
  | "blocked"
  | "in-progress"
  | "awaiting-return-check"
  | "completed"
  | "cancelled";

export interface MaintenanceTeamState {
  readonly skills: readonly MaintenanceSkill[];
  readonly reservedTaskId: string | null;
  readonly unavailableUntilSec: SimSeconds | null;
}

export interface MaintenanceEquipmentState {
  readonly id: string;
  readonly unitId: EntityId;
  readonly group: ProductionFunctionalGroupKind;
  readonly actualCondition: EquipmentCondition;
  readonly estimatedCondition: EquipmentCondition;
  readonly uncertaintyPct: number;
  readonly criticality: MaintenanceCriticality;
  readonly wearBasisPoints: number;
  readonly cycleCount: number;
  readonly lastInspectionAtSec: SimSeconds | null;
}

export interface MaintenanceTaskState {
  readonly id: string;
  readonly kind: MaintenanceTaskKind;
  readonly targetUnitId: EntityId;
  readonly targetGroup: ProductionFunctionalGroupKind;
  readonly startsAtSec: SimSeconds;
  readonly expectedDurationSec: SimSeconds;
  readonly status: MaintenanceTaskStatus;
  readonly requiredSkills: readonly MaintenanceSkill[];
  readonly assignedTeamId: EntityId | null;
  readonly startedAtSec: SimSeconds | null;
  readonly completesAtSec: SimSeconds | null;
  readonly estimatedCostCents: MoneyCents;
  readonly committedCostCents: MoneyCents;
  readonly estimatedLostGenerationMwh: number;
  readonly effectSummary: string;
  readonly unknowns: readonly string[];
  readonly returnCheckRequired: boolean;
  readonly blockedReason: string | null;
  readonly lastEventId: string | null;
}

export interface MaintenanceState {
  readonly equipment: Readonly<Record<string, MaintenanceEquipmentState>>;
  readonly tasks: Readonly<Record<string, MaintenanceTaskState>>;
}
