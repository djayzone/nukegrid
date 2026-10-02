import type {
  ProductionDiagnosticStatus,
  ProductionOperatingState,
  ProductionPowerSchedulePoint,
  ProductionTransitionState,
  ProductionUnitState
} from "../contracts/production.js";
import type { AssetState, WorldState } from "../contracts/world.js";
import type { SimSeconds } from "../contracts/units.js";

export interface ProductionDiagnostic {
  readonly status: ProductionDiagnosticStatus;
  readonly reasons: readonly string[];
}

export interface TransitionRule {
  readonly from: ProductionOperatingState;
  readonly to: ProductionOperatingState;
  readonly durationSec: SimSeconds;
}

export type TransitionCheck =
  | { readonly ok: true; readonly rule: TransitionRule }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly alternativeState: ProductionOperatingState;
    };

const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: "stopped", to: "start-preparation", durationSec: 900 },
  { from: "start-preparation", to: "stopped", durationSec: 300 },
  { from: "start-preparation", to: "producing", durationSec: 1800 },
  { from: "producing", to: "limited", durationSec: 0 },
  { from: "limited", to: "producing", durationSec: 0 },
  { from: "producing", to: "planned-shutdown", durationSec: 900 },
  { from: "limited", to: "planned-shutdown", durationSec: 900 },
  { from: "planned-shutdown", to: "stopped", durationSec: 900 },
  { from: "forced-outage", to: "return-tests", durationSec: 1800 },
  { from: "return-tests", to: "producing", durationSec: 1800 }
];

function allGroupsAvailable(unit: ProductionUnitState): boolean {
  return Object.values(unit.groups).every((group) => group.available);
}

function alternativeFor(state: ProductionOperatingState): ProductionOperatingState {
  switch (state) {
    case "stopped":
      return "start-preparation";
    case "start-preparation":
      return "producing";
    case "producing":
    case "limited":
      return "planned-shutdown";
    case "planned-shutdown":
      return "stopped";
    case "forced-outage":
      return "return-tests";
    case "return-tests":
      return "producing";
  }
}

export function checkUnitTransition(
  unit: ProductionUnitState,
  target: ProductionOperatingState
): TransitionCheck {
  if (unit.transition) {
    return {
      ok: false,
      reason: "transition-in-progress",
      alternativeState: unit.transition.to
    };
  }
  const rule = TRANSITION_RULES.find(
    (candidate) => candidate.from === unit.operatingState && candidate.to === target
  );
  if (!rule) {
    return {
      ok: false,
      reason: "transition-not-allowed",
      alternativeState: alternativeFor(unit.operatingState)
    };
  }
  if (
    (target === "start-preparation" || target === "return-tests" || target === "producing") &&
    !allGroupsAvailable(unit)
  ) {
    return {
      ok: false,
      reason: "functional-group-unavailable",
      alternativeState: unit.operatingState
    };
  }
  if (target === "producing" && unit.availableNetPowerMw < unit.nominalNetPowerMw) {
    return {
      ok: false,
      reason: "capacity-limited",
      alternativeState: "limited"
    };
  }
  return { ok: true, rule };
}

export function startUnitTransition(
  unit: ProductionUnitState,
  target: ProductionOperatingState,
  nowSec: SimSeconds
): ProductionUnitState {
  const check = checkUnitTransition(unit, target);
  if (!check.ok) throw new Error("PRODUCTION_TRANSITION_FORBIDDEN");
  if (check.rule.durationSec === 0) {
    return {
      ...unit,
      operatingState: target,
      transition: null
    };
  }
  const transition: ProductionTransitionState = {
    from: unit.operatingState,
    to: target,
    startedAtSec: nowSec,
    completesAtSec: nowSec + check.rule.durationSec
  };
  return { ...unit, transition };
}

export function maximumSchedulablePower(unit: ProductionUnitState): number {
  if (!allGroupsAvailable(unit)) return 0;
  return Math.min(unit.nominalNetPowerMw, unit.availableNetPowerMw);
}

export function setUnitPowerSchedule(
  unit: ProductionUnitState,
  points: readonly ProductionPowerSchedulePoint[],
  nowSec: SimSeconds
): ProductionUnitState {
  const due = points.filter((point) => point.atSec <= nowSec);
  const plannedNetPowerMw = due.length > 0
    ? due[due.length - 1]!.netPowerMw
    : unit.plannedNetPowerMw;
  return {
    ...unit,
    plannedNetPowerMw,
    powerSchedule: points
      .filter((point) => point.atSec > nowSec)
      .map((point) => ({ ...point }))
  };
}

function effectiveTargetPower(unit: ProductionUnitState): number {
  if (unit.transition || !allGroupsAvailable(unit)) return 0;
  if (unit.operatingState !== "producing" && unit.operatingState !== "limited") return 0;
  return Math.min(unit.plannedNetPowerMw, unit.availableNetPowerMw, unit.nominalNetPowerMw);
}

function integrateUnit(unit: ProductionUnitState, durationSec: SimSeconds): ProductionUnitState {
  if (durationSec <= 0) return unit;
  const durationHours = durationSec / 3600;
  const startMw = unit.realizedNetPowerMw;
  const targetMw = effectiveTargetPower(unit);
  if (startMw === targetMw) {
    return {
      ...unit,
      generatedMwh: unit.generatedMwh + startMw * durationHours
    };
  }

  const increasing = targetMw > startMw;
  const rampMwPerHour = increasing ? unit.rampUpMwPerHour : unit.rampDownMwPerHour;
  const deltaMw = Math.abs(targetMw - startMw);
  const timeToTargetHours = deltaMw / rampMwPerHour;

  if (timeToTargetHours >= durationHours) {
    const signedDelta = rampMwPerHour * durationHours * (increasing ? 1 : -1);
    const endMw = startMw + signedDelta;
    return {
      ...unit,
      realizedNetPowerMw: endMw,
      generatedMwh: unit.generatedMwh + ((startMw + endMw) / 2) * durationHours
    };
  }

  const rampEnergyMwh = ((startMw + targetMw) / 2) * timeToTargetHours;
  const steadyEnergyMwh = targetMw * (durationHours - timeToTargetHours);
  return {
    ...unit,
    realizedNetPowerMw: targetMw,
    generatedMwh: unit.generatedMwh + rampEnergyMwh + steadyEnergyMwh
  };
}

function assetAvailability(unit: ProductionUnitState): boolean {
  return (
    unit.operatingState !== "forced-outage" &&
    unit.availableNetPowerMw > 0 &&
    allGroupsAvailable(unit)
  );
}

export function getProductionUnit(world: WorldState, id: string): ProductionUnitState | null {
  const asset = world.assets[id];
  return asset?.kind === "production-unit" && asset.productionUnit
    ? asset.productionUnit
    : null;
}

export function updateProductionUnit(
  world: WorldState,
  id: string,
  updater: (unit: ProductionUnitState) => ProductionUnitState
): WorldState {
  const asset = world.assets[id];
  if (!asset || asset.kind !== "production-unit" || !asset.productionUnit) {
    throw new Error("PRODUCTION_UNIT_UNKNOWN");
  }
  const productionUnit = updater(asset.productionUnit);
  const nextAsset: AssetState = {
    ...asset,
    available: assetAvailability(productionUnit),
    productionUnit
  };
  return {
    ...world,
    assets: {
      ...world.assets,
      [id]: nextAsset
    }
  };
}

export function advanceProductionTo(world: WorldState, targetSec: SimSeconds): WorldState {
  if (targetSec < world.simTimeSec) throw new Error("PRODUCTION_TIME_PAST");
  const durationSec = targetSec - world.simTimeSec;
  if (durationSec === 0) return world;
  const assets = Object.fromEntries(
    Object.entries(world.assets).map(([id, asset]) => {
      if (asset.kind !== "production-unit" || !asset.productionUnit) return [id, asset];
      const productionUnit = integrateUnit(asset.productionUnit, durationSec);
      return [
        id,
        {
          ...asset,
          available: assetAvailability(productionUnit),
          productionUnit
        }
      ];
    })
  ) as WorldState["assets"];
  return { ...world, simTimeSec: targetSec, assets };
}

export function nextProductionBoundaryAt(world: WorldState): SimSeconds | null {
  let next = Number.POSITIVE_INFINITY;
  for (const asset of Object.values(world.assets)) {
    const unit = asset.productionUnit;
    if (!unit) continue;
    if (unit.transition && unit.transition.completesAtSec > world.simTimeSec) {
      next = Math.min(next, unit.transition.completesAtSec);
    }
    for (const point of unit.powerSchedule) {
      if (point.atSec > world.simTimeSec) next = Math.min(next, point.atSec);
    }
  }
  return Number.isFinite(next) ? next : null;
}

export function applyProductionBoundaries(world: WorldState): WorldState {
  let nextWorld = world;
  for (const [id, asset] of Object.entries(world.assets)) {
    if (asset.kind !== "production-unit" || !asset.productionUnit) continue;
    const unit = asset.productionUnit;
    const duePoints = unit.powerSchedule.filter((point) => point.atSec <= world.simTimeSec);
    const remainingPoints = unit.powerSchedule.filter((point) => point.atSec > world.simTimeSec);
    let nextUnit: ProductionUnitState = {
      ...unit,
      plannedNetPowerMw: duePoints.length > 0
        ? duePoints[duePoints.length - 1]!.netPowerMw
        : unit.plannedNetPowerMw,
      powerSchedule: remainingPoints
    };

    if (nextUnit.transition && nextUnit.transition.completesAtSec <= world.simTimeSec) {
      const targetState = nextUnit.transition.to;
      nextUnit = {
        ...nextUnit,
        operatingState: targetState,
        transition: null
      };
      if (targetState === "stopped" || targetState === "forced-outage") {
        nextUnit = {
          ...nextUnit,
          plannedNetPowerMw: 0,
          realizedNetPowerMw: 0,
          powerSchedule: []
        };
      }
    }

    if (nextUnit !== unit) {
      nextWorld = updateProductionUnit(nextWorld, id, () => nextUnit);
    }
  }
  return nextWorld;
}

export function productionDiagnostic(unit: ProductionUnitState): ProductionDiagnostic {
  const reasons: string[] = [];
  if (unit.transition) {
    reasons.push(
      `transition ${unit.transition.from} -> ${unit.transition.to} until t=${unit.transition.completesAtSec}s`
    );
    return { status: "transitioning", reasons };
  }
  const unavailableGroups = Object.values(unit.groups)
    .filter((group) => !group.available)
    .map((group) => group.label);
  if (unavailableGroups.length > 0) reasons.push(`unavailable groups: ${unavailableGroups.join(", ")}`);

  if (unit.operatingState === "forced-outage" || unavailableGroups.length > 0) {
    if (reasons.length === 0) reasons.push("forced outage");
    return { status: "unavailable", reasons };
  }
  if (unit.operatingState === "stopped" || unit.operatingState === "planned-shutdown") {
    reasons.push(unit.operatingState);
    return { status: "stopped", reasons };
  }
  if (
    unit.operatingState === "limited" ||
    unit.availableNetPowerMw < unit.nominalNetPowerMw
  ) {
    reasons.push(`available capacity ${unit.availableNetPowerMw} MW / nominal ${unit.nominalNetPowerMw} MW`);
    return { status: "limited", reasons };
  }
  return { status: "ready", reasons };
}
