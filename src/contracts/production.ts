import type { MegawattHours, Megawatts, SimSeconds } from "./units.js";

export const PRODUCTION_OPERATING_STATES = [
  "stopped",
  "start-preparation",
  "producing",
  "limited",
  "planned-shutdown",
  "forced-outage",
  "return-tests"
] as const;

export type ProductionOperatingState = typeof PRODUCTION_OPERATING_STATES[number];

export const PRODUCTION_GROUP_KINDS = [
  "nuclear-island",
  "turbine",
  "generator",
  "grid-connection"
] as const;

export type ProductionFunctionalGroupKind = typeof PRODUCTION_GROUP_KINDS[number];

export interface ProductionFunctionalGroupState {
  readonly kind: ProductionFunctionalGroupKind;
  readonly label: string;
  readonly available: boolean;
}

export interface ProductionPowerSchedulePoint {
  readonly atSec: SimSeconds;
  readonly netPowerMw: Megawatts;
}

export interface ProductionTransitionState {
  readonly from: ProductionOperatingState;
  readonly to: ProductionOperatingState;
  readonly startedAtSec: SimSeconds;
  readonly completesAtSec: SimSeconds;
}

export interface ProductionUnitState {
  readonly operatingState: ProductionOperatingState;
  readonly nominalNetPowerMw: Megawatts;
  readonly availableNetPowerMw: Megawatts;
  readonly plannedNetPowerMw: Megawatts;
  readonly realizedNetPowerMw: Megawatts;
  readonly rampUpMwPerHour: Megawatts;
  readonly rampDownMwPerHour: Megawatts;
  readonly generatedMwh: MegawattHours;
  readonly groups: Readonly<Record<ProductionFunctionalGroupKind, ProductionFunctionalGroupState>>;
  readonly powerSchedule: readonly ProductionPowerSchedulePoint[];
  readonly transition: ProductionTransitionState | null;
}

export type ProductionDiagnosticStatus =
  | "ready"
  | "stopped"
  | "limited"
  | "unavailable"
  | "transitioning";
