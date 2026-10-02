import { baseEventFields, type GameEvent } from "../contracts/events.js";
import type { ScenarioIncidentState } from "../contracts/scenario.js";
import type { SimSeconds } from "../contracts/units.js";
import type { PlayerObservation, WorldState } from "../contracts/world.js";
import { contractVolumeMwh } from "../contracts/delivery.js";

export interface ScenarioMutation {
  readonly world: WorldState;
  readonly events: readonly GameEvent[];
}

interface ScenarioJournalEntry {
  readonly atSec: SimSeconds;
  readonly kind: "command-executed" | "command-rejected" | "event" | "advance-stopped";
  readonly id: string;
  readonly type?: string;
}

function putIncident(world: WorldState, incident: ScenarioIncidentState): WorldState {
  return {
    ...world,
    scenario: {
      ...world.scenario,
      incidents: {
        ...world.scenario.incidents,
        [incident.id]: incident
      }
    }
  };
}

function preconditionMet(world: WorldState, incident: ScenarioIncidentState): boolean {
  if (incident.family === "mechanical") {
    const item = world.maintenance.equipment[`${incident.targetId}:${incident.targetGroup}`];
    return item?.actualCondition === "degraded" || item?.actualCondition === "faulted";
  }
  if (incident.family === "resource") {
    return world.assets[incident.targetId]?.kind === "team";
  }
  const evening = world.economy.deliveryContracts["delivery-valmorne-evening"];
  const ledger = world.economy.deliveryLedgers["delivery-valmorne-evening"];
  return Boolean(evening && ledger && !ledger.settled);
}

function avoidanceReason(world: WorldState, incident: ScenarioIncidentState): string | null {
  if (incident.family === "mechanical") {
    const item = world.maintenance.equipment[`${incident.targetId}:${incident.targetGroup}`];
    if (item?.actualCondition === "healthy") return "target-repaired-before-consequence";
    return null;
  }
  if (incident.family === "resource") {
    const team = world.assets[incident.targetId]?.maintenanceTeam;
    return team?.reservedTaskId ? `team-reserved:${team.reservedTaskId}` : null;
  }
  const contract = world.economy.deliveryContracts["delivery-valmorne-evening"];
  if (!contract) return null;
  const purchasedMwh = Object.values(world.economy.replacementPurchases)
    .filter((purchase) => purchase.contractId === contract.id)
    .reduce((sum, purchase) => sum + purchase.energyMwh, 0);
  return purchasedMwh >= contractVolumeMwh(contract)
    ? "evening-delivery-fully-covered-before-price-spike"
    : null;
}

function signalIncident(world: WorldState, incident: ScenarioIncidentState): ScenarioMutation {
  if (!preconditionMet(world, incident)) {
    return {
      world: putIncident(world, {
        ...incident,
        status: "avoided",
        avoidedBy: "precondition-not-met"
      }),
      events: []
    };
  }

  const eventId = `scenario:${incident.id}:signal`;
  const signal: GameEvent = {
    ...baseEventFields(eventId, world.simTimeSec, [incident.targetId], null, "warning"),
    type: "ScenarioSignal",
    payload: {
      incidentId: incident.id,
      family: incident.family,
      signal: incident.signalText
    }
  };
  return {
    world: putIncident(world, {
      ...incident,
      status: "signaled",
      signalEventId: eventId
    }),
    events: [signal]
  };
}

function applyMechanicalConsequence(world: WorldState, incident: ScenarioIncidentState): WorldState {
  const asset = world.assets[incident.targetId];
  if (!asset?.productionUnit) return world;
  const unit = asset.productionUnit;
  return {
    ...world,
    assets: {
      ...world.assets,
      [incident.targetId]: {
        ...asset,
        productionUnit: {
          ...unit,
          availableNetPowerMw: Math.max(0, unit.availableNetPowerMw - 200),
          operatingState: unit.operatingState === "producing" ? "limited" : unit.operatingState
        }
      }
    }
  };
}

function applyResourceConsequence(world: WorldState, incident: ScenarioIncidentState): WorldState {
  const asset = world.assets[incident.targetId];
  if (!asset?.maintenanceTeam) return world;
  return {
    ...world,
    assets: {
      ...world.assets,
      [incident.targetId]: {
        ...asset,
        available: false,
        maintenanceTeam: {
          ...asset.maintenanceTeam,
          unavailableUntilSec: incident.effectEndsAtSec
        }
      }
    }
  };
}

function consequenceIncident(world: WorldState, incident: ScenarioIncidentState): ScenarioMutation {
  if (incident.status !== "signaled") return { world, events: [] };
  const avoidedBy = avoidanceReason(world, incident);
  if (avoidedBy) {
    const eventId = `scenario:${incident.id}:avoided`;
    const avoided: GameEvent = {
      ...baseEventFields(eventId, world.simTimeSec, [incident.targetId], incident.signalEventId, "notice"),
      type: "ScenarioIncidentAvoided",
      payload: { incidentId: incident.id, avoidedBy }
    };
    return {
      world: putIncident(world, {
        ...incident,
        status: "avoided",
        consequenceEventId: eventId,
        avoidedBy
      }),
      events: [avoided]
    };
  }

  let next = world;
  if (incident.family === "mechanical") next = applyMechanicalConsequence(next, incident);
  if (incident.family === "resource") next = applyResourceConsequence(next, incident);

  const eventId = `scenario:${incident.id}:consequence`;
  const consequence: GameEvent = {
    ...baseEventFields(eventId, world.simTimeSec, [incident.targetId], incident.signalEventId, "warning"),
    type: "ScenarioConsequence",
    payload: {
      incidentId: incident.id,
      consequence: incident.consequenceText,
      relatedReferenceIds: incident.relatedReferenceIds
    }
  };
  next = putIncident(next, {
    ...incident,
    status: "consequence",
    consequenceEventId: eventId
  });
  return { world: next, events: [consequence] };
}

function endIncidentEffect(world: WorldState, incident: ScenarioIncidentState): WorldState {
  if (incident.status !== "consequence" || incident.effectEndsAtSec !== world.simTimeSec) return world;
  if (incident.family === "mechanical") {
    const asset = world.assets[incident.targetId];
    if (!asset?.productionUnit) return world;
    const unit = asset.productionUnit;
    const restoredAvailableMw = Math.min(
      unit.nominalNetPowerMw,
      unit.availableNetPowerMw + 200
    );
    return {
      ...world,
      assets: {
        ...world.assets,
        [incident.targetId]: {
          ...asset,
          productionUnit: {
            ...unit,
            availableNetPowerMw: restoredAvailableMw,
            operatingState:
              unit.operatingState === "limited" && restoredAvailableMw === unit.nominalNetPowerMw
                ? "producing"
                : unit.operatingState
          }
        }
      }
    };
  }
  if (incident.family === "resource") {
    const asset = world.assets[incident.targetId];
    if (!asset?.maintenanceTeam || asset.maintenanceTeam.reservedTaskId) return world;
    return {
      ...world,
      assets: {
        ...world.assets,
        [incident.targetId]: {
          ...asset,
          available: true,
          maintenanceTeam: {
            ...asset.maintenanceTeam,
            unavailableUntilSec: null
          }
        }
      }
    };
  }
  return world;
}

function revealIncident(world: WorldState, incident: ScenarioIncidentState): ScenarioMutation {
  if (incident.status === "pending") return { world, events: [] };
  const eventId = `scenario:${incident.id}:reveal`;
  const reveal: GameEvent = {
    ...baseEventFields(
      eventId,
      world.simTimeSec,
      [incident.targetId],
      incident.consequenceEventId ?? incident.signalEventId,
      "info"
    ),
    type: "ScenarioCauseRevealed",
    payload: {
      incidentId: incident.id,
      cause: incident.hiddenCause,
      learning: incident.learningText
    }
  };
  return {
    world: putIncident(world, {
      ...incident,
      status: "revealed",
      revealEventId: eventId
    }),
    events: [reveal]
  };
}

export function nextScenarioBoundaryAt(world: WorldState): SimSeconds | null {
  let next = Number.POSITIVE_INFINITY;
  for (const incident of Object.values(world.scenario.incidents)) {
    if (incident.status === "pending" && incident.signalAtSec > world.simTimeSec) {
      next = Math.min(next, incident.signalAtSec);
    }
    if (incident.status === "signaled" && incident.consequenceAtSec > world.simTimeSec) {
      next = Math.min(next, incident.consequenceAtSec);
    }
    if (
      incident.status === "consequence" &&
      incident.effectEndsAtSec !== null &&
      incident.effectEndsAtSec > world.simTimeSec
    ) {
      next = Math.min(next, incident.effectEndsAtSec);
    }
    if (
      incident.status !== "pending" &&
      incident.status !== "revealed" &&
      incident.revealCauseAtSec > world.simTimeSec
    ) {
      next = Math.min(next, incident.revealCauseAtSec);
    }
  }
  if (!world.scenario.debriefReady && world.scenario.sessionEndSec > world.simTimeSec) {
    next = Math.min(next, world.scenario.sessionEndSec);
  }
  return Number.isFinite(next) ? next : null;
}

export function applyScenarioBoundaries(world: WorldState): ScenarioMutation {
  let next = world;
  const events: GameEvent[] = [];

  for (const incidentId of Object.keys(next.scenario.incidents).sort()) {
    let incident = next.scenario.incidents[incidentId]!;
    if (incident.status === "pending" && incident.signalAtSec <= next.simTimeSec) {
      const result = signalIncident(next, incident);
      next = result.world;
      events.push(...result.events);
      incident = next.scenario.incidents[incidentId]!;
    }
    if (incident.status === "signaled" && incident.consequenceAtSec <= next.simTimeSec) {
      const result = consequenceIncident(next, incident);
      next = result.world;
      events.push(...result.events);
      incident = next.scenario.incidents[incidentId]!;
    }
    next = endIncidentEffect(next, incident);
    incident = next.scenario.incidents[incidentId]!;
    if (
      incident.status !== "pending" &&
      incident.status !== "revealed" &&
      incident.revealCauseAtSec <= next.simTimeSec
    ) {
      const result = revealIncident(next, incident);
      next = result.world;
      events.push(...result.events);
    }
  }

  if (!next.scenario.debriefReady && next.simTimeSec >= next.scenario.sessionEndSec) {
    next = {
      ...next,
      scenario: { ...next.scenario, debriefReady: true }
    };
    const debrief: GameEvent = {
      ...baseEventFields(
        `scenario:${next.scenario.id}:debrief`,
        next.simTimeSec,
        ["plant-valmorne"],
        null,
        "notice"
      ),
      type: "ScenarioDebriefReady",
      payload: { scenarioId: next.scenario.id }
    };
    events.push(debrief);
  }
  return { world: next, events };
}

function eventSummary(event: GameEvent): string {
  switch (event.type) {
    case "ScenarioSignal":
      return event.payload.signal;
    case "ScenarioConsequence":
      return event.payload.consequence;
    case "ScenarioIncidentAvoided":
      return `Incident évité : ${event.payload.avoidedBy}`;
    case "ScenarioCauseRevealed":
      return `${event.payload.cause} — ${event.payload.learning}`;
    default:
      return event.type;
  }
}

export function scenarioObservation(
  world: WorldState,
  executedEvents: readonly GameEvent[],
  journal: readonly ScenarioJournalEntry[]
): PlayerObservation["scenario"] {
  const incidentCards = Object.values(world.scenario.incidents)
    .filter((incident) => incident.signalEventId !== null || world.scenario.debriefReady)
    .sort((a, b) => a.signalAtSec - b.signalAtSec || a.id.localeCompare(b.id))
    .map((incident) => ({
      id: incident.id,
      family: incident.family,
      status: incident.status,
      signalText: incident.signalEventId ? incident.signalText : null,
      possibleDecision: incident.signalEventId ? incident.possibleDecision : null,
      consequenceText:
        incident.consequenceEventId && !incident.avoidedBy ? incident.consequenceText : null,
      knownCause: incident.status === "revealed" ? incident.hiddenCause : null,
      learningText: incident.status === "revealed" ? incident.learningText : null,
      signalAtSec: incident.signalAtSec,
      consequenceAtSec: incident.consequenceAtSec,
      knowableAtDecision: incident.signalEventId
        ? [incident.signalText, incident.possibleDecision]
        : [],
      relatedReferenceIds: incident.relatedReferenceIds
    }));

  const visibleSignals = Object.values(world.scenario.incidents)
    .filter((incident) => incident.signalEventId !== null)
    .sort((a, b) => a.signalAtSec - b.signalAtSec || a.id.localeCompare(b.id));
  const alertGroups: Array<{
    id: string;
    fromSec: SimSeconds;
    toSec: SimSeconds;
    incidentIds: string[];
  }> = [];
  for (const incident of visibleSignals) {
    const last = alertGroups.at(-1);
    if (last && incident.signalAtSec - last.toSec <= 900) {
      last.toSec = incident.signalAtSec;
      last.incidentIds = [...last.incidentIds, incident.id];
    } else {
      alertGroups.push({
        id: `alerts-${incident.signalAtSec}`,
        fromSec: incident.signalAtSec,
        toSec: incident.signalAtSec,
        incidentIds: [incident.id]
      });
    }
  }

  let debrief: PlayerObservation["scenario"]["debrief"] = null;
  if (world.scenario.debriefReady) {
    const scenarioEvents = executedEvents
      .filter((event) => event.type.startsWith("Scenario"))
      .map((event) => ({
        atSec: event.atSec,
        kind:
          event.type === "ScenarioSignal"
            ? "signal" as const
            : event.type === "ScenarioCauseRevealed"
              ? "reveal" as const
              : "consequence" as const,
        referenceId: event.id,
        summary: eventSummary(event)
      }));
    const commands = journal
      .filter((entry) => entry.kind === "command-executed")
      .map((entry) => ({
        atSec: entry.atSec,
        kind: "command" as const,
        referenceId: entry.id,
        summary: entry.type ?? "command"
      }));
    const finances = world.transactions.map((transaction) => ({
      atSec: transaction.atSec,
      kind: "finance" as const,
      referenceId: transaction.id,
      summary: `${transaction.kind}: ${transaction.amountCents} cents`
    }));
    debrief = {
      ready: true,
      timeline: [...scenarioEvents, ...commands, ...finances].sort(
        (a, b) => a.atSec - b.atSec || a.referenceId.localeCompare(b.referenceId)
      )
    };
  }

  return {
    id: world.scenario.id,
    title: world.scenario.title,
    briefing: world.scenario.briefing,
    objectives: world.scenario.objectives,
    horizons: world.scenario.horizons,
    incidentCards,
    alertGroups,
    debrief
  };
}
