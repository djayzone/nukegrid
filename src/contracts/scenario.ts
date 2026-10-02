import type { EntityId } from "./commands.js";
import type { ProductionFunctionalGroupKind } from "./production.js";
import type { SimSeconds } from "./units.js";

export const INCIDENT_FAMILIES = ["mechanical", "resource", "program-price"] as const;
export type IncidentFamily = typeof INCIDENT_FAMILIES[number];

export type ScenarioIncidentStatus =
  | "pending"
  | "signaled"
  | "consequence"
  | "avoided"
  | "revealed";

export interface ScenarioIncidentState {
  readonly id: string;
  readonly family: IncidentFamily;
  readonly targetId: EntityId;
  readonly targetGroup: ProductionFunctionalGroupKind | null;
  readonly precondition: string;
  readonly hiddenCause: string;
  readonly signalText: string;
  readonly possibleDecision: string;
  readonly consequenceText: string;
  readonly learningText: string;
  readonly signalAtSec: SimSeconds;
  readonly consequenceAtSec: SimSeconds;
  readonly revealCauseAtSec: SimSeconds;
  readonly effectEndsAtSec: SimSeconds | null;
  readonly deterministicRoll: number;
  readonly relatedReferenceIds: readonly string[];
  readonly status: ScenarioIncidentStatus;
  readonly signalEventId: string | null;
  readonly consequenceEventId: string | null;
  readonly revealEventId: string | null;
  readonly avoidedBy: string | null;
}

export interface ScenarioObjective {
  readonly id: string;
  readonly label: string;
}

export interface ScenarioState {
  readonly id: string;
  readonly title: string;
  readonly briefing: readonly string[];
  readonly objectives: readonly ScenarioObjective[];
  readonly sessionEndSec: SimSeconds;
  readonly horizons: {
    readonly now: string;
    readonly medium: string;
    readonly long: string;
  };
  readonly incidents: Readonly<Record<string, ScenarioIncidentState>>;
  readonly debriefReady: boolean;
}
