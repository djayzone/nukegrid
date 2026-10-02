import { CONTRACT_VERSION, type ContractVersion } from "./versions.js";
import type { MaintenanceTaskKind } from "./maintenance.js";
import type {
  ProductionFunctionalGroupKind,
  ProductionOperatingState,
  ProductionPowerSchedulePoint
} from "./production.js";
import type { EuroPerMegawattHour, Megawatts, SimSeconds } from "./units.js";

export type ActorId = string;
export type EntityId = string;
export type CommandId = string;

interface CommandEnvelope<TType extends string, TPayload> {
  readonly id: CommandId;
  readonly contractVersion: ContractVersion;
  readonly type: TType;
  readonly actorId: ActorId;
  readonly targetId: EntityId;
  readonly targetSimTimeSec: SimSeconds;
  readonly payload: TPayload;
}

export type SetPowerScheduleCommand = CommandEnvelope<"SetPowerSchedule", {
  readonly points: readonly ProductionPowerSchedulePoint[];
}>;

export type RequestUnitStateCommand = CommandEnvelope<"RequestUnitState", {
  readonly state: ProductionOperatingState;
}>;

export type ScheduleMaintenanceCommand = CommandEnvelope<"ScheduleMaintenance", {
  readonly taskId: string;
  readonly kind: MaintenanceTaskKind;
  readonly targetGroup: ProductionFunctionalGroupKind;
  readonly startsAtSec: SimSeconds;
  readonly expectedDurationSec: SimSeconds;
}>;

export type AssignTeamCommand = CommandEnvelope<"AssignTeam", {
  readonly teamId: EntityId;
  readonly taskId: string;
}>;

export type CancelMaintenanceCommand = CommandEnvelope<"CancelMaintenance", {
  readonly taskId: string;
}>;

export type CompleteMaintenanceReturnCheckCommand = CommandEnvelope<"CompleteMaintenanceReturnCheck", {
  readonly taskId: string;
}>;

export type BuyReplacementEnergyCommand = CommandEnvelope<"BuyReplacementEnergy", {
  readonly contractId: string;
  readonly deliveryStartSec: SimSeconds;
  readonly deliveryEndSec: SimSeconds;
  readonly powerMw: Megawatts;
  readonly maxPriceEurPerMwh: EuroPerMegawattHour;
}>;

export type SetDelegationPolicyCommand = CommandEnvelope<"SetDelegationPolicy", {
  readonly policyId: string;
  readonly enabled: boolean;
  readonly maxAutomaticSpendCents: number;
}>;

export type AdvanceUntilCommand = CommandEnvelope<"AdvanceUntil", {
  readonly untilSec: SimSeconds;
}>;

export type GameCommand =
  | SetPowerScheduleCommand
  | RequestUnitStateCommand
  | ScheduleMaintenanceCommand
  | AssignTeamCommand
  | CancelMaintenanceCommand
  | CompleteMaintenanceReturnCheckCommand
  | BuyReplacementEnergyCommand
  | SetDelegationPolicyCommand
  | AdvanceUntilCommand;

export type RejectionCode =
  | "COMMAND_SCHEMA_INVALID"
  | "COMMAND_VERSION_UNSUPPORTED"
  | "COMMAND_TARGET_TIME_PAST"
  | "COMMAND_DUPLICATE_ID"
  | "COMMAND_ACTOR_UNAUTHORIZED"
  | "COMMAND_TARGET_UNKNOWN"
  | "COMMAND_INVARIANT_VIOLATION"
  | "COMMAND_POWER_UNAVAILABLE"
  | "COMMAND_TRANSITION_FORBIDDEN"
  | "COMMAND_MAINTENANCE_TASK_CONFLICT"
  | "COMMAND_MAINTENANCE_RESOURCE_UNAVAILABLE"
  | "COMMAND_MAINTENANCE_SKILL_MISSING"
  | "COMMAND_MAINTENANCE_STATE_INVALID"
  | "COMMAND_CASH_INSUFFICIENT"
  | "COMMAND_MARKET_PRICE_LIMIT"
  | "COMMAND_MARKET_LIQUIDITY_LIMIT"
  | "COMMAND_DELIVERY_WINDOW_INVALID"
  | "COMMAND_DELIVERY_ALREADY_SETTLED";

export type CommandResult =
  | { readonly status: "accepted"; readonly commandId: CommandId }
  | {
      readonly status: "adjusted";
      readonly commandId: CommandId;
      readonly adjustmentCode: "COMMAND_BOUNDED";
      readonly parameters: Readonly<Record<string, string | number | boolean>>;
    }
  | {
      readonly status: "rejected";
      readonly commandId: CommandId;
      readonly code: RejectionCode;
      readonly parameters: Readonly<Record<string, string | number | boolean>>;
    };

export function command<T extends GameCommand>(value: T): T {
  return value;
}

export function baseCommandFields(
  id: CommandId,
  actorId: ActorId,
  targetId: EntityId,
  targetSimTimeSec: SimSeconds
) {
  return { id, contractVersion: CONTRACT_VERSION, actorId, targetId, targetSimTimeSec } as const;
}
