import type { EntityId } from "./commands.js";
import type { MaintenanceTaskKind } from "./maintenance.js";
import type { ProductionFunctionalGroupKind } from "./production.js";
import type { MoneyCents, SimSeconds } from "./units.js";
import { CONTRACT_VERSION, type ContractVersion } from "./versions.js";

export type EventId = string;
export type EventSeverity = "info" | "notice" | "warning" | "critical";

interface EventEnvelope<TType extends string, TPayload> {
  readonly id: EventId;
  readonly contractVersion: ContractVersion;
  readonly type: TType;
  readonly atSec: SimSeconds;
  readonly entityIds: readonly EntityId[];
  readonly causalParentId: EventId | null;
  readonly severity: EventSeverity;
  readonly payload: TPayload;
}

export type FaultDetectedEvent = EventEnvelope<"FaultDetected", {
  readonly faultCode: string;
}>;

export type OutputLimitedEvent = EventEnvelope<"OutputLimited", {
  readonly reason: string;
  readonly missingPowerMw: number;
}>;

export type EnergyShortfallEvent = EventEnvelope<"EnergyShortfall", {
  readonly missingEnergyMwh: number;
}>;

export type ReplacementEnergyPurchasedEvent = EventEnvelope<"ReplacementEnergyPurchased", {
  readonly energyMwh: number;
  readonly priceEurPerMwh: number;
}>;

export type CashChangedEvent = EventEnvelope<"CashChanged", {
  readonly deltaCents: MoneyCents;
  readonly reason: string;
}>;

export type DeliverySettledEvent = EventEnvelope<"DeliverySettled", {
  readonly contractId: string;
  readonly contractedMwh: number;
  readonly physicalGenerationMwh: number;
  readonly replacementAppliedMwh: number;
  readonly shortfallMwh: number;
  readonly surplusMwh: number;
  readonly netCashDeltaCents: MoneyCents;
}>;

export type MaintenanceStartedEvent = EventEnvelope<"MaintenanceStarted", {
  readonly taskId: string;
  readonly kind: MaintenanceTaskKind;
  readonly group: ProductionFunctionalGroupKind;
  readonly committedCostCents: MoneyCents;
}>;

export type MaintenanceBlockedEvent = EventEnvelope<"MaintenanceBlocked", {
  readonly taskId: string;
  readonly reason: string;
}>;

export type InspectionCompletedEvent = EventEnvelope<"InspectionCompleted", {
  readonly taskId: string;
  readonly equipmentId: string;
  readonly uncertaintyPct: number;
}>;

export type RepairCompletedEvent = EventEnvelope<"RepairCompleted", {
  readonly taskId: string;
  readonly equipmentId: string;
  readonly effect: string;
  readonly returnCheckRequired: true;
}>;

export type MaintenanceCancelledEvent = EventEnvelope<"MaintenanceCancelled", {
  readonly taskId: string;
  readonly retainedCostCents: MoneyCents;
}>;

export type MaintenanceReturnCheckCompletedEvent = EventEnvelope<"MaintenanceReturnCheckCompleted", {
  readonly taskId: string;
}>;

export type ScenarioSignalEvent = EventEnvelope<"ScenarioSignal", {
  readonly incidentId: string;
  readonly family: "mechanical" | "resource" | "program-price";
  readonly signal: string;
}>;

export type ScenarioConsequenceEvent = EventEnvelope<"ScenarioConsequence", {
  readonly incidentId: string;
  readonly consequence: string;
  readonly relatedReferenceIds: readonly string[];
}>;

export type ScenarioIncidentAvoidedEvent = EventEnvelope<"ScenarioIncidentAvoided", {
  readonly incidentId: string;
  readonly avoidedBy: string;
}>;

export type ScenarioCauseRevealedEvent = EventEnvelope<"ScenarioCauseRevealed", {
  readonly incidentId: string;
  readonly cause: string;
  readonly learning: string;
}>;

export type ScenarioDebriefReadyEvent = EventEnvelope<"ScenarioDebriefReady", {
  readonly scenarioId: string;
}>;

export type GameEvent =
  | FaultDetectedEvent
  | OutputLimitedEvent
  | EnergyShortfallEvent
  | ReplacementEnergyPurchasedEvent
  | CashChangedEvent
  | DeliverySettledEvent
  | MaintenanceStartedEvent
  | MaintenanceBlockedEvent
  | InspectionCompletedEvent
  | RepairCompletedEvent
  | MaintenanceCancelledEvent
  | MaintenanceReturnCheckCompletedEvent
  | ScenarioSignalEvent
  | ScenarioConsequenceEvent
  | ScenarioIncidentAvoidedEvent
  | ScenarioCauseRevealedEvent
  | ScenarioDebriefReadyEvent;

export function event<T extends GameEvent>(value: T): T {
  return value;
}

export function baseEventFields(
  id: EventId,
  atSec: SimSeconds,
  entityIds: readonly EntityId[],
  causalParentId: EventId | null,
  severity: EventSeverity
) {
  return { id, contractVersion: CONTRACT_VERSION, atSec, entityIds, causalParentId, severity } as const;
}
