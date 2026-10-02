import type { CommandId, EntityId } from "./commands.js";
import type { GameEvent } from "./events.js";
import type { EconomyState } from "./economy.js";
import type { ScenarioState } from "./scenario.js";
import type {
  MaintenanceEquipmentState,
  MaintenanceState,
  MaintenanceTeamState,
  MaintenanceTaskState
} from "./maintenance.js";
import type {
  ProductionDiagnosticStatus,
  ProductionFunctionalGroupKind,
  ProductionOperatingState,
  ProductionUnitState
} from "./production.js";
import type { MegawattHours, Megawatts, MoneyCents, SimSeconds } from "./units.js";

export interface AssetState {
  readonly id: EntityId;
  readonly kind: "plant" | "production-unit" | "team" | "connection";
  readonly label: string;
  readonly available: boolean;
  readonly productionUnit?: ProductionUnitState;
  readonly maintenanceTeam?: MaintenanceTeamState;
}

export interface PolicyState {
  readonly id: string;
  readonly enabled: boolean;
}

export interface Transaction {
  readonly id: string;
  readonly atSec: SimSeconds;
  readonly kind: "contract-settlement" | "replacement-energy" | "imbalance" | "maintenance";
  readonly amountCents: MoneyCents;
  readonly referenceId: string;
}

export interface WorldState {
  readonly simTimeSec: SimSeconds;
  readonly cashCents: MoneyCents;
  readonly assets: Readonly<Record<EntityId, AssetState>>;
  readonly maintenance: MaintenanceState;
  readonly economy: EconomyState;
  readonly scenario: ScenarioState;
  readonly policies: Readonly<Record<string, PolicyState>>;
  readonly transactions: readonly Transaction[];
  readonly processedCommandIds: readonly CommandId[];
  readonly futureEvents: readonly GameEvent[];
}

export type ObservationConfidence = "known" | "estimated" | "authorized";

export interface ObservedValue<T> {
  readonly confidence: ObservationConfidence;
  readonly value: T;
  readonly observedAtSec: SimSeconds;
}

export interface ObservedProductionUnit {
  readonly operatingState: ObservedValue<ProductionOperatingState>;
  readonly nominalNetPowerMw: ObservedValue<Megawatts>;
  readonly availableNetPowerMw: ObservedValue<Megawatts>;
  readonly plannedNetPowerMw: ObservedValue<Megawatts>;
  readonly realizedNetPowerMw: ObservedValue<Megawatts>;
  readonly generatedMwh: ObservedValue<MegawattHours>;
  readonly groups: Readonly<Record<ProductionFunctionalGroupKind, {
    readonly label: string;
    readonly available: ObservedValue<boolean>;
  }>>;
  readonly diagnostic: {
    readonly status: ProductionDiagnosticStatus;
    readonly reasons: readonly string[];
  };
}

export interface ObservedMaintenanceTask extends Omit<
  MaintenanceTaskState,
  "committedCostCents" | "lastEventId"
> {
  readonly committedCostCents: ObservedValue<MoneyCents>;
}

export interface ObservedMaintenanceEquipment extends Omit<
  MaintenanceEquipmentState,
  "actualCondition"
> {}

export interface PlayerObservation {
  readonly simTimeSec: SimSeconds;
  readonly visibleAssets: Readonly<Record<EntityId, {
    readonly label: string;
    readonly available: ObservedValue<boolean>;
    readonly productionUnit?: ObservedProductionUnit;
    readonly maintenanceTeam?: {
      readonly skills: readonly string[];
      readonly reservedTaskId: ObservedValue<string | null>;
      readonly unavailableUntilSec: ObservedValue<SimSeconds | null>;
    };
  }>>;
  readonly maintenance: {
    readonly tasks: Readonly<Record<string, ObservedMaintenanceTask>>;
    readonly equipment: Readonly<Record<string, ObservedMaintenanceEquipment>>;
  };
  readonly economy: {
    readonly currentMarketPriceEurPerMwh: ObservedValue<number>;
    readonly forecasts: readonly {
      readonly forSec: SimSeconds;
      readonly expectedEurPerMwh: number;
      readonly uncertaintyEurPerMwh: number;
    }[];
    readonly commitments: readonly {
      readonly id: string;
      readonly deliveryStartSec: SimSeconds;
      readonly deliveryEndSec: SimSeconds;
      readonly nominationDeadlineSec: SimSeconds;
      readonly committedPowerMw: Megawatts;
      readonly contractedMwh: MegawattHours;
      readonly contractPriceEurPerMwh: number;
      readonly settled: boolean;
      readonly physicalGenerationMwh: MegawattHours;
      readonly replacementPurchasedMwh: MegawattHours;
      readonly remainingExposureMwh: MegawattHours;
    }[];
    readonly kpis: {
      readonly cashCents: { readonly value: MoneyCents; readonly references: readonly string[] };
      readonly operatingResultCents: { readonly value: MoneyCents; readonly references: readonly string[] };
      readonly upcomingCommittedMwh: { readonly value: MegawattHours; readonly references: readonly string[] };
      readonly imbalanceExposureMwh: { readonly value: MegawattHours; readonly references: readonly string[] };
    };
    readonly maintenanceImpacts: Readonly<Record<string, {
      readonly committedCostCents: MoneyCents;
      readonly estimatedLostGenerationMwh: MegawattHours;
      readonly estimatedReplacementCostCents: MoneyCents;
      readonly references: readonly string[];
    }>>;
  };
  readonly scenario: {
    readonly id: string;
    readonly title: string;
    readonly briefing: readonly string[];
    readonly objectives: readonly { readonly id: string; readonly label: string }[];
    readonly horizons: ScenarioState["horizons"];
    readonly incidentCards: readonly {
      readonly id: string;
      readonly family: string;
      readonly status: string;
      readonly signalText: string | null;
      readonly possibleDecision: string | null;
      readonly consequenceText: string | null;
      readonly knownCause: string | null;
      readonly learningText: string | null;
      readonly signalAtSec: SimSeconds;
      readonly consequenceAtSec: SimSeconds;
      readonly knowableAtDecision: readonly string[];
      readonly relatedReferenceIds: readonly string[];
    }[];
    readonly alertGroups: readonly {
      readonly id: string;
      readonly fromSec: SimSeconds;
      readonly toSec: SimSeconds;
      readonly incidentIds: readonly string[];
    }[];
    readonly debrief: null | {
      readonly ready: true;
      readonly timeline: readonly {
        readonly atSec: SimSeconds;
        readonly kind: "signal" | "command" | "consequence" | "finance" | "reveal";
        readonly referenceId: string;
        readonly summary: string;
      }[];
    };
  };
  readonly cashCents: ObservedValue<MoneyCents>;
  readonly recentEvents: readonly GameEvent[];
}
