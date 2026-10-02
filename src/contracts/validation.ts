import type { GameCommand } from "./commands.js";
import {
  EQUIPMENT_CONDITIONS,
  MAINTENANCE_SKILLS,
  MAINTENANCE_TASK_KINDS
} from "./maintenance.js";
import {
  PRODUCTION_GROUP_KINDS,
  PRODUCTION_OPERATING_STATES,
  type ProductionUnitState
} from "./production.js";
import type { WorldState } from "./world.js";
import { INCIDENT_FAMILIES } from "./scenario.js";
import { CONTRACT_VERSION } from "./versions.js";
import { assertIntegerSimSeconds } from "./units.js";

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function issue(
  issues: ValidationIssue[],
  code: string,
  path: string,
  parameters: Readonly<Record<string, string | number | boolean>> = {}
): void {
  issues.push({ code, path, parameters });
}

function validFinite(value: number): boolean {
  return Number.isFinite(value);
}

function validNonNegativeFinite(value: number): boolean {
  return validFinite(value) && value >= 0;
}

function validPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validatePayload(command: GameCommand, issues: ValidationIssue[]): void {
  switch (command.type) {
    case "SetPowerSchedule": {
      if (command.payload.points.length === 0) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.points", { reason: "empty" });
      }
      let previous = -1;
      command.payload.points.forEach((point, index) => {
        if (!validNonNegativeSafeInteger(point.atSec)) {
          issue(issues, "UNIT_SIM_SECONDS_INVALID", `$.payload.points[${index}].atSec`, {
            received: point.atSec
          });
        }
        if (!validNonNegativeFinite(point.netPowerMw)) {
          issue(issues, "UNIT_POWER_MW_INVALID", `$.payload.points[${index}].netPowerMw`, {
            received: point.netPowerMw
          });
        }
        if (index > 0 && point.atSec <= previous) {
          issue(issues, "COMMAND_PAYLOAD_INVALID", `$.payload.points[${index}].atSec`, {
            reason: "schedule-not-strictly-increasing"
          });
        }
        if (point.atSec < command.targetSimTimeSec) {
          issue(issues, "COMMAND_PAYLOAD_INVALID", `$.payload.points[${index}].atSec`, {
            reason: "schedule-point-before-command-time"
          });
        }
        previous = point.atSec;
      });
      break;
    }
    case "RequestUnitState":
      if (!PRODUCTION_OPERATING_STATES.includes(command.payload.state)) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.state", {
          reason: "unknown-production-state"
        });
      }
      break;
    case "ScheduleMaintenance":
      if (!command.payload.taskId) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.taskId", { reason: "empty" });
      }
      if (!MAINTENANCE_TASK_KINDS.includes(command.payload.kind)) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.kind", {
          reason: "unknown-maintenance-kind"
        });
      }
      if (!PRODUCTION_GROUP_KINDS.includes(command.payload.targetGroup)) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.targetGroup", {
          reason: "unknown-production-group"
        });
      }
      if (!validNonNegativeSafeInteger(command.payload.startsAtSec)) {
        issue(issues, "UNIT_SIM_SECONDS_INVALID", "$.payload.startsAtSec", {
          received: command.payload.startsAtSec
        });
      } else if (command.payload.startsAtSec < command.targetSimTimeSec) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.startsAtSec", {
          reason: "maintenance-start-before-command-time"
        });
      }
      if (!Number.isSafeInteger(command.payload.expectedDurationSec) || command.payload.expectedDurationSec <= 0) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.expectedDurationSec", {
          reason: "must-be-positive-integer-seconds"
        });
      }
      break;
    case "AssignTeam":
      if (!command.payload.teamId || !command.payload.taskId) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload", { reason: "team-and-task-required" });
      }
      break;
    case "CancelMaintenance":
    case "CompleteMaintenanceReturnCheck":
      if (!command.payload.taskId) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.taskId", { reason: "empty" });
      }
      break;
    case "BuyReplacementEnergy":
      if (!validNonNegativeSafeInteger(command.payload.deliveryStartSec)) {
        issue(issues, "UNIT_SIM_SECONDS_INVALID", "$.payload.deliveryStartSec", {
          received: command.payload.deliveryStartSec
        });
      }
      if (!validNonNegativeSafeInteger(command.payload.deliveryEndSec)) {
        issue(issues, "UNIT_SIM_SECONDS_INVALID", "$.payload.deliveryEndSec", {
          received: command.payload.deliveryEndSec
        });
      }
      if (command.payload.deliveryEndSec <= command.payload.deliveryStartSec) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.deliveryEndSec", {
          reason: "must-be-after-delivery-start"
        });
      }
      if (!validNonNegativeFinite(command.payload.powerMw)) {
        issue(issues, "UNIT_POWER_MW_INVALID", "$.payload.powerMw", {
          received: command.payload.powerMw
        });
      }
      if (!command.payload.contractId) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.contractId", { reason: "empty" });
      }
      if (!validFinite(command.payload.maxPriceEurPerMwh)) {
        issue(issues, "UNIT_PRICE_EUR_PER_MWH_INVALID", "$.payload.maxPriceEurPerMwh", {
          received: command.payload.maxPriceEurPerMwh
        });
      }
      break;
    case "SetDelegationPolicy":
      if (!command.payload.policyId) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.policyId", { reason: "empty" });
      }
      if (!validNonNegativeSafeInteger(command.payload.maxAutomaticSpendCents)) {
        issue(issues, "UNIT_MONEY_CENTS_INVALID", "$.payload.maxAutomaticSpendCents", {
          received: command.payload.maxAutomaticSpendCents
        });
      }
      break;
    case "AdvanceUntil":
      if (!validNonNegativeSafeInteger(command.payload.untilSec)) {
        issue(issues, "UNIT_SIM_SECONDS_INVALID", "$.payload.untilSec", {
          received: command.payload.untilSec
        });
      }
      if (command.payload.untilSec < command.targetSimTimeSec) {
        issue(issues, "COMMAND_PAYLOAD_INVALID", "$.payload.untilSec", {
          reason: "until-before-target-time"
        });
      }
      break;
  }
}

function validateProductionUnit(
  unit: ProductionUnitState,
  path: string,
  issues: ValidationIssue[]
): void {
  if (!PRODUCTION_OPERATING_STATES.includes(unit.operatingState)) {
    issue(issues, "WORLD_PRODUCTION_STATE_INVALID", `${path}.operatingState`);
  }
  for (const [field, value] of [
    ["nominalNetPowerMw", unit.nominalNetPowerMw],
    ["availableNetPowerMw", unit.availableNetPowerMw],
    ["plannedNetPowerMw", unit.plannedNetPowerMw],
    ["realizedNetPowerMw", unit.realizedNetPowerMw],
    ["generatedMwh", unit.generatedMwh]
  ] as const) {
    if (!validNonNegativeFinite(value)) {
      issue(issues, "WORLD_PRODUCTION_VALUE_INVALID", `${path}.${field}`, { received: value });
    }
  }
  if (!validPositiveFinite(unit.rampUpMwPerHour) || !validPositiveFinite(unit.rampDownMwPerHour)) {
    issue(issues, "WORLD_PRODUCTION_RAMP_INVALID", path, {
      rampUpMwPerHour: unit.rampUpMwPerHour,
      rampDownMwPerHour: unit.rampDownMwPerHour
    });
  }
  if (unit.availableNetPowerMw > unit.nominalNetPowerMw) {
    issue(issues, "WORLD_PRODUCTION_CAPACITY_INVALID", `${path}.availableNetPowerMw`, {
      nominalNetPowerMw: unit.nominalNetPowerMw
    });
  }
  if (unit.plannedNetPowerMw > unit.nominalNetPowerMw || unit.realizedNetPowerMw > unit.nominalNetPowerMw) {
    issue(issues, "WORLD_PRODUCTION_POWER_ABOVE_NOMINAL", path, {
      nominalNetPowerMw: unit.nominalNetPowerMw
    });
  }
  const groupKeys = Object.keys(unit.groups);
  if (
    groupKeys.length !== PRODUCTION_GROUP_KINDS.length ||
    !PRODUCTION_GROUP_KINDS.every((kind) => kind in unit.groups)
  ) {
    issue(issues, "WORLD_PRODUCTION_GROUPS_INVALID", `${path}.groups`);
  }
  unit.powerSchedule.forEach((point, index) => {
    if (!validNonNegativeSafeInteger(point.atSec) || !validNonNegativeFinite(point.netPowerMw)) {
      issue(issues, "WORLD_PRODUCTION_SCHEDULE_INVALID", `${path}.powerSchedule[${index}]`);
    }
    if (point.netPowerMw > unit.nominalNetPowerMw) {
      issue(issues, "WORLD_PRODUCTION_SCHEDULE_ABOVE_NOMINAL", `${path}.powerSchedule[${index}].netPowerMw`, {
        nominalNetPowerMw: unit.nominalNetPowerMw
      });
    }
  });
  if (unit.transition) {
    if (
      unit.transition.from !== unit.operatingState ||
      !validNonNegativeSafeInteger(unit.transition.startedAtSec) ||
      !validNonNegativeSafeInteger(unit.transition.completesAtSec) ||
      unit.transition.completesAtSec < unit.transition.startedAtSec
    ) {
      issue(issues, "WORLD_PRODUCTION_TRANSITION_INVALID", `${path}.transition`);
    }
  }
  if (
    !unit.transition &&
    (unit.operatingState === "stopped" || unit.operatingState === "forced-outage") &&
    unit.realizedNetPowerMw !== 0
  ) {
    issue(issues, "WORLD_PRODUCTION_STOPPED_OUTPUT_NONZERO", `${path}.realizedNetPowerMw`);
  }
}

function validateMaintenance(world: WorldState, issues: ValidationIssue[]): void {
  for (const [id, item] of Object.entries(world.maintenance.equipment)) {
    const path = `$.maintenance.equipment.${id}`;
    if (!world.assets[item.unitId]?.productionUnit) {
      issue(issues, "WORLD_MAINTENANCE_UNIT_UNKNOWN", `${path}.unitId`);
    }
    if (!PRODUCTION_GROUP_KINDS.includes(item.group)) {
      issue(issues, "WORLD_MAINTENANCE_GROUP_INVALID", `${path}.group`);
    }
    if (!EQUIPMENT_CONDITIONS.includes(item.actualCondition) || !EQUIPMENT_CONDITIONS.includes(item.estimatedCondition)) {
      issue(issues, "WORLD_MAINTENANCE_CONDITION_INVALID", path);
    }
    if (!Number.isFinite(item.uncertaintyPct) || item.uncertaintyPct < 0 || item.uncertaintyPct > 100) {
      issue(issues, "WORLD_MAINTENANCE_UNCERTAINTY_INVALID", `${path}.uncertaintyPct`);
    }
    if (!validNonNegativeSafeInteger(item.wearBasisPoints) || item.wearBasisPoints > 10_000) {
      issue(issues, "WORLD_MAINTENANCE_WEAR_INVALID", `${path}.wearBasisPoints`);
    }
    if (!validNonNegativeSafeInteger(item.cycleCount)) {
      issue(issues, "WORLD_MAINTENANCE_CYCLES_INVALID", `${path}.cycleCount`);
    }
  }

  for (const [id, task] of Object.entries(world.maintenance.tasks)) {
    const path = `$.maintenance.tasks.${id}`;
    if (!MAINTENANCE_TASK_KINDS.includes(task.kind)) {
      issue(issues, "WORLD_MAINTENANCE_KIND_INVALID", `${path}.kind`);
    }
    if (!world.assets[task.targetUnitId]?.productionUnit) {
      issue(issues, "WORLD_MAINTENANCE_UNIT_UNKNOWN", `${path}.targetUnitId`);
    }
    if (!PRODUCTION_GROUP_KINDS.includes(task.targetGroup)) {
      issue(issues, "WORLD_MAINTENANCE_GROUP_INVALID", `${path}.targetGroup`);
    }
    if (!validNonNegativeSafeInteger(task.startsAtSec) || !validNonNegativeSafeInteger(task.expectedDurationSec)) {
      issue(issues, "WORLD_MAINTENANCE_TIME_INVALID", path);
    }
    if (!validNonNegativeSafeInteger(task.estimatedCostCents) || !validNonNegativeSafeInteger(task.committedCostCents)) {
      issue(issues, "WORLD_MAINTENANCE_COST_INVALID", path);
    }
    if (task.committedCostCents > task.estimatedCostCents) {
      issue(issues, "WORLD_MAINTENANCE_COST_OVERCOMMITTED", path);
    }
    if (!task.requiredSkills.every((skill) => MAINTENANCE_SKILLS.includes(skill))) {
      issue(issues, "WORLD_MAINTENANCE_SKILL_INVALID", `${path}.requiredSkills`);
    }
    if (task.assignedTeamId) {
      const team = world.assets[task.assignedTeamId];
      if (team?.kind !== "team" || !team.maintenanceTeam) {
        issue(issues, "WORLD_MAINTENANCE_TEAM_UNKNOWN", `${path}.assignedTeamId`);
      }
    }
  }
}

function validateEconomy(world: WorldState, issues: ValidationIssue[]): void {
  const contracts = Object.values(world.economy.deliveryContracts).sort(
    (a, b) => a.deliveryStartSec - b.deliveryStartSec || a.id.localeCompare(b.id)
  );
  for (const contract of contracts) {
    const path = `$.economy.deliveryContracts.${contract.id}`;
    if (
      !validNonNegativeSafeInteger(contract.deliveryStartSec) ||
      !validNonNegativeSafeInteger(contract.deliveryEndSec) ||
      contract.deliveryEndSec <= contract.deliveryStartSec
    ) {
      issue(issues, "WORLD_DELIVERY_WINDOW_INVALID", path);
    }
    if (!validNonNegativeFinite(contract.committedPowerMw)) {
      issue(issues, "WORLD_DELIVERY_POWER_INVALID", `${path}.committedPowerMw`);
    }
    for (const [field, value] of [
      ["contractPriceEurPerMwh", contract.contractPriceEurPerMwh],
      ["shortImbalancePriceEurPerMwh", contract.shortImbalancePriceEurPerMwh],
      ["longImbalancePriceEurPerMwh", contract.longImbalancePriceEurPerMwh]
    ] as const) {
      if (!validFinite(value)) issue(issues, "WORLD_DELIVERY_PRICE_INVALID", `${path}.${field}`);
    }
    if (!world.economy.deliveryLedgers[contract.id]) {
      issue(issues, "WORLD_DELIVERY_LEDGER_MISSING", `$.economy.deliveryLedgers.${contract.id}`);
    }
  }
  for (let index = 1; index < contracts.length; index += 1) {
    const previous = contracts[index - 1]!;
    const current = contracts[index]!;
    if (current.deliveryStartSec < previous.deliveryEndSec) {
      issue(issues, "WORLD_DELIVERY_OVERLAP_DOUBLE_SALE", "$.economy.deliveryContracts", {
        firstContractId: previous.id,
        secondContractId: current.id
      });
    }
  }

  let previousPriceAt = -1;
  for (const [index, point] of world.economy.marketPriceCurve.entries()) {
    if (!validNonNegativeSafeInteger(point.atSec) || point.atSec <= previousPriceAt) {
      issue(issues, "WORLD_MARKET_CURVE_TIME_INVALID", `$.economy.marketPriceCurve[${index}].atSec`);
    }
    if (!validFinite(point.priceEurPerMwh)) {
      issue(issues, "WORLD_MARKET_PRICE_INVALID", `$.economy.marketPriceCurve[${index}].priceEurPerMwh`);
    }
    previousPriceAt = point.atSec;
  }
  if (world.economy.marketPriceCurve.length === 0) {
    issue(issues, "WORLD_MARKET_CURVE_EMPTY", "$.economy.marketPriceCurve");
  }
  if (!validNonNegativeFinite(world.economy.forecastUncertaintyEurPerMwh)) {
    issue(issues, "WORLD_FORECAST_UNCERTAINTY_INVALID", "$.economy.forecastUncertaintyEurPerMwh");
  }
  if (
    !validPositiveFinite(world.economy.maxReplacementPowerMw) ||
    !validPositiveFinite(world.economy.maxReplacementEnergyMwhPerContract)
  ) {
    issue(issues, "WORLD_MARKET_LIQUIDITY_INVALID", "$.economy");
  }

  for (const [id, purchase] of Object.entries(world.economy.replacementPurchases)) {
    if (!world.economy.deliveryContracts[purchase.contractId]) {
      issue(issues, "WORLD_REPLACEMENT_CONTRACT_UNKNOWN", `$.economy.replacementPurchases.${id}.contractId`);
    }
    if (
      !validNonNegativeFinite(purchase.powerMw) ||
      !validNonNegativeFinite(purchase.energyMwh) ||
      !validFinite(purchase.priceEurPerMwh) ||
      !Number.isSafeInteger(purchase.costCents)
    ) {
      issue(issues, "WORLD_REPLACEMENT_PURCHASE_INVALID", `$.economy.replacementPurchases.${id}`);
    }
  }

  const explainedCash = world.economy.openingCashCents +
    world.transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  if (explainedCash !== world.cashCents) {
    issue(issues, "WORLD_CASH_RECONCILIATION_FAILED", "$.cashCents", {
      openingCashCents: world.economy.openingCashCents,
      transactionTotalCents: explainedCash - world.economy.openingCashCents,
      expectedCashCents: explainedCash,
      actualCashCents: world.cashCents
    });
  }
}

function validateScenario(world: WorldState, issues: ValidationIssue[]): void {
  if (!world.scenario.id || world.scenario.sessionEndSec <= 0) {
    issue(issues, "WORLD_SCENARIO_INVALID", "$.scenario");
  }
  for (const [id, incident] of Object.entries(world.scenario.incidents)) {
    const path = `$.scenario.incidents.${id}`;
    if (!INCIDENT_FAMILIES.includes(incident.family)) {
      issue(issues, "WORLD_SCENARIO_INCIDENT_FAMILY_INVALID", `${path}.family`);
    }
    if (
      incident.signalAtSec < 0 ||
      incident.consequenceAtSec <= incident.signalAtSec ||
      incident.revealCauseAtSec < incident.consequenceAtSec ||
      incident.revealCauseAtSec > world.scenario.sessionEndSec
    ) {
      issue(issues, "WORLD_SCENARIO_INCIDENT_TIMELINE_INVALID", path);
    }
    if (!(incident.targetId in world.assets)) {
      issue(issues, "WORLD_SCENARIO_TARGET_UNKNOWN", `${path}.targetId`);
    }
    if (
      !Number.isSafeInteger(incident.deterministicRoll) ||
      incident.deterministicRoll < 0 ||
      incident.deterministicRoll > 99
    ) {
      issue(issues, "WORLD_SCENARIO_ROLL_INVALID", `${path}.deterministicRoll`);
    }
  }
}

export function validateCommand(command: GameCommand, world: WorldState): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!command.id || !command.actorId || !command.targetId) {
    issue(issues, "COMMAND_SCHEMA_INVALID", "$");
  }
  if (command.contractVersion !== CONTRACT_VERSION) {
    issue(issues, "COMMAND_VERSION_UNSUPPORTED", "$.contractVersion", {
      supported: CONTRACT_VERSION,
      received: command.contractVersion
    });
  }
  try {
    assertIntegerSimSeconds(command.targetSimTimeSec);
  } catch {
    issue(issues, "UNIT_SIM_SECONDS_INVALID", "$.targetSimTimeSec", {
      received: command.targetSimTimeSec
    });
  }
  if (command.targetSimTimeSec < world.simTimeSec) {
    issue(issues, "COMMAND_TARGET_TIME_PAST", "$.targetSimTimeSec", {
      now: world.simTimeSec,
      received: command.targetSimTimeSec
    });
  }
  if (world.processedCommandIds.includes(command.id)) {
    issue(issues, "COMMAND_DUPLICATE_ID", "$.id", { commandId: command.id });
  }
  if (!(command.targetId in world.assets) && command.type !== "AdvanceUntil") {
    issue(issues, "COMMAND_TARGET_UNKNOWN", "$.targetId", { targetId: command.targetId });
  }
  validatePayload(command, issues);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateWorldState(world: WorldState): ValidationResult {
  const issues: ValidationIssue[] = [];
  try {
    assertIntegerSimSeconds(world.simTimeSec);
  } catch {
    issue(issues, "WORLD_SIM_TIME_INVALID", "$.simTimeSec");
  }
  if (!Number.isSafeInteger(world.cashCents)) {
    issue(issues, "WORLD_CASH_NOT_INTEGER_CENTS", "$.cashCents");
  }
  const transactionIds = world.transactions.map((tx) => tx.id);
  if (new Set(transactionIds).size !== transactionIds.length) {
    issue(issues, "WORLD_TRANSACTION_ID_DUPLICATE", "$.transactions");
  }
  if (new Set(world.processedCommandIds).size !== world.processedCommandIds.length) {
    issue(issues, "WORLD_COMMAND_ID_DUPLICATE", "$.processedCommandIds");
  }
  for (const [id, asset] of Object.entries(world.assets)) {
    if (asset.kind === "production-unit") {
      if (!asset.productionUnit) {
        issue(issues, "WORLD_PRODUCTION_UNIT_MISSING", `$.assets.${id}.productionUnit`);
      } else {
        validateProductionUnit(asset.productionUnit, `$.assets.${id}.productionUnit`, issues);
      }
    } else if (asset.productionUnit) {
      issue(issues, "WORLD_PRODUCTION_UNIT_UNEXPECTED", `$.assets.${id}.productionUnit`);
    }
    if (asset.kind === "team") {
      if (!asset.maintenanceTeam) {
        issue(issues, "WORLD_MAINTENANCE_TEAM_MISSING", `$.assets.${id}.maintenanceTeam`);
      } else if (!asset.maintenanceTeam.skills.every((skill) => MAINTENANCE_SKILLS.includes(skill))) {
        issue(issues, "WORLD_MAINTENANCE_SKILL_INVALID", `$.assets.${id}.maintenanceTeam.skills`);
      }
    } else if (asset.maintenanceTeam) {
      issue(issues, "WORLD_MAINTENANCE_TEAM_UNEXPECTED", `$.assets.${id}.maintenanceTeam`);
    }
  }
  validateMaintenance(world, issues);
  validateEconomy(world, issues);
  validateScenario(world, issues);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
