import { CONTENT_VERSION } from "../contracts/versions.js";
import type { PrototypeDeliveryContract } from "../contracts/delivery.js";
import type {
  MaintenanceCriticality,
  MaintenanceEquipmentState,
  MaintenanceState,
  MaintenanceTeamState
} from "../contracts/maintenance.js";
import type {
  ProductionFunctionalGroupKind,
  ProductionFunctionalGroupState,
  ProductionUnitState
} from "../contracts/production.js";
import type { PlayerObservation, WorldState } from "../contracts/world.js";

export const VALMORNE_FIXTURE_ID = "valmorne-l05";

function groups(unit: string): Readonly<Record<ProductionFunctionalGroupKind, ProductionFunctionalGroupState>> {
  return {
    "nuclear-island": {
      kind: "nuclear-island",
      label: `Îlot nucléaire abstrait ${unit}`,
      available: true
    },
    turbine: {
      kind: "turbine",
      label: `Turbine ${unit}`,
      available: true
    },
    generator: {
      kind: "generator",
      label: `Alternateur ${unit}`,
      available: true
    },
    "grid-connection": {
      kind: "grid-connection",
      label: `Raccordement ${unit}`,
      available: true
    }
  };
}

function stoppedUnit(nominalNetPowerMw: number, rampMwPerHour: number, unit: string): ProductionUnitState {
  return {
    operatingState: "stopped",
    nominalNetPowerMw,
    availableNetPowerMw: nominalNetPowerMw,
    plannedNetPowerMw: 0,
    realizedNetPowerMw: 0,
    rampUpMwPerHour: rampMwPerHour,
    rampDownMwPerHour: rampMwPerHour,
    generatedMwh: 0,
    groups: groups(unit),
    powerSchedule: [],
    transition: null
  };
}

function team(skills: MaintenanceTeamState["skills"]): MaintenanceTeamState {
  return { skills, reservedTaskId: null, unavailableUntilSec: null };
}

function equipment(
  unitId: string,
  group: ProductionFunctionalGroupKind,
  wearBasisPoints: number,
  criticality: MaintenanceCriticality,
  actualCondition: MaintenanceEquipmentState["actualCondition"],
  estimatedCondition: MaintenanceEquipmentState["estimatedCondition"],
  uncertaintyPct: number,
  cycleCount: number
): MaintenanceEquipmentState {
  return {
    id: `${unitId}:${group}`,
    unitId,
    group,
    actualCondition,
    estimatedCondition,
    uncertaintyPct,
    criticality,
    wearBasisPoints,
    cycleCount,
    lastInspectionAtSec: null
  };
}

const maintenanceEquipment = Object.fromEntries([
  equipment("unit-valmorne-1", "nuclear-island", 3100, "high", "healthy", "healthy", 25, 18),
  equipment("unit-valmorne-1", "turbine", 6900, "high", "degraded", "healthy", 65, 42),
  equipment("unit-valmorne-1", "generator", 4400, "medium", "healthy", "healthy", 30, 31),
  equipment("unit-valmorne-1", "grid-connection", 2200, "high", "healthy", "healthy", 20, 11),
  equipment("unit-valmorne-2", "nuclear-island", 3600, "high", "healthy", "healthy", 30, 21),
  equipment("unit-valmorne-2", "turbine", 5100, "high", "healthy", "healthy", 35, 35),
  equipment("unit-valmorne-2", "generator", 5800, "medium", "degraded", "healthy", 55, 39),
  equipment("unit-valmorne-2", "grid-connection", 2600, "high", "healthy", "healthy", 20, 14)
].map((item) => [item.id, item])) as MaintenanceState["equipment"];

export const valmorneDeliveryContract: PrototypeDeliveryContract = {
  id: "delivery-valmorne-day-1",
  zoneId: "zone-valmorne",
  deliveryStartSec: 3600,
  deliveryEndSec: 7200,
  nominationDeadlineSec: 1800,
  committedPowerMw: 800,
  contractPriceEurPerMwh: 70,
  settlementDelaySec: 3600,
  shortImbalancePriceEurPerMwh: 130,
  longImbalancePriceEurPerMwh: 40
};

export const valmorneMiddayDeliveryContract: PrototypeDeliveryContract = {
  id: "delivery-valmorne-midday",
  zoneId: "zone-valmorne",
  deliveryStartSec: 28800,
  deliveryEndSec: 36000,
  nominationDeadlineSec: 25200,
  committedPowerMw: 400,
  contractPriceEurPerMwh: 85,
  settlementDelaySec: 3600,
  shortImbalancePriceEurPerMwh: 180,
  longImbalancePriceEurPerMwh: 35
};

export const valmorneEveningDeliveryContract: PrototypeDeliveryContract = {
  id: "delivery-valmorne-evening",
  zoneId: "zone-valmorne",
  deliveryStartSec: 50400,
  deliveryEndSec: 57600,
  nominationDeadlineSec: 46800,
  committedPowerMw: 400,
  contractPriceEurPerMwh: 90,
  settlementDelaySec: 3600,
  shortImbalancePriceEurPerMwh: 230,
  longImbalancePriceEurPerMwh: 30
};

export const valmorneWorld: WorldState = {
  simTimeSec: 0,
  cashCents: 25_000_000_00,
  assets: {
    "plant-valmorne": {
      id: "plant-valmorne",
      kind: "plant",
      label: "Centrale fictive de Valmorne",
      available: true
    },
    "unit-valmorne-1": {
      id: "unit-valmorne-1",
      kind: "production-unit",
      label: "Tranche Valmorne 1",
      available: true,
      productionUnit: stoppedUnit(900, 300, "V1")
    },
    "unit-valmorne-2": {
      id: "unit-valmorne-2",
      kind: "production-unit",
      label: "Tranche Valmorne 2",
      available: true,
      productionUnit: stoppedUnit(850, 250, "V2")
    },
    "connection-valmorne": {
      id: "connection-valmorne",
      kind: "connection",
      label: "Raccordement fictif Valmorne",
      available: true
    },
    "team-valmorne-a": {
      id: "team-valmorne-a",
      kind: "team",
      label: "Équipe A — mécanique/électrique",
      available: true,
      maintenanceTeam: team(["mechanical", "electrical"])
    },
    "team-valmorne-b": {
      id: "team-valmorne-b",
      kind: "team",
      label: "Équipe B — instrumentation/électrique",
      available: true,
      maintenanceTeam: team(["instrumentation", "electrical"])
    }
  },
  maintenance: {
    equipment: maintenanceEquipment,
    tasks: {}
  },
  economy: {
    openingCashCents: 25_000_000_00,
    deliveryContracts: {
      [valmorneDeliveryContract.id]: valmorneDeliveryContract,
      [valmorneMiddayDeliveryContract.id]: valmorneMiddayDeliveryContract,
      [valmorneEveningDeliveryContract.id]: valmorneEveningDeliveryContract
    },
    deliveryLedgers: {
      [valmorneDeliveryContract.id]: {
        contractId: valmorneDeliveryContract.id,
        physicalGenerationMwh: 0,
        settled: false,
        settlement: null
      },
      [valmorneMiddayDeliveryContract.id]: {
        contractId: valmorneMiddayDeliveryContract.id,
        physicalGenerationMwh: 0,
        settled: false,
        settlement: null
      },
      [valmorneEveningDeliveryContract.id]: {
        contractId: valmorneEveningDeliveryContract.id,
        physicalGenerationMwh: 0,
        settled: false,
        settlement: null
      }
    },
    replacementPurchases: {},
    marketPriceCurve: [
      { atSec: 0, priceEurPerMwh: 120 },
      { atSec: 3600, priceEurPerMwh: 120 },
      { atSec: 7200, priceEurPerMwh: -25 },
      { atSec: 10800, priceEurPerMwh: 80 },
      { atSec: 14400, priceEurPerMwh: 140 },
      { atSec: 46800, priceEurPerMwh: 150 },
      { atSec: 54000, priceEurPerMwh: 220 },
      { atSec: 64800, priceEurPerMwh: 110 },
      { atSec: 86400, priceEurPerMwh: 95 }
    ],
    forecastUncertaintyEurPerMwh: 15,
    maxReplacementPowerMw: 1000,
    maxReplacementEnergyMwhPerContract: 800
  },
  scenario: {
    id: "valmorne-24h-reference",
    title: "Relève sous tension à Valmorne",
    briefing: [
      "Vous prenez la relève pour 24 h sur deux tranches fictives de Valmorne.",
      "Une pointe de livraison approche avec une prévision imparfaite.",
      "Les équipes sont limitées : anticipez maintenance, couverture et indisponibilités."
    ],
    objectives: [
      { id: "delivery", label: "Tenir l'engagement de livraison sans double vente." },
      { id: "maintenance", label: "Traiter les signaux techniques avec une ressource adaptée." },
      { id: "cash", label: "Limiter le coût des écarts et garder une trésorerie explicable." }
    ],
    sessionEndSec: 86400,
    horizons: {
      now: "Maintenant : état des tranches, alertes et décisions immédiates.",
      medium: "24–72 h : maintenance, engagements, prix et ressources.",
      long: "Mois/années : usure, cycles et arbitrages structurels futurs."
    },
    debriefReady: false,
    incidents: {
      "incident-vibration-v1": {
        id: "incident-vibration-v1",
        family: "mechanical",
        targetId: "unit-valmorne-1",
        targetGroup: "turbine",
        precondition: "unit-valmorne-1:turbine is degraded",
        hiddenCause: "Usure progressive du palier turbine V1.",
        signalText: "Tendance vibration turbine V1 au-dessus de sa référence.",
        possibleDecision: "Inspecter puis réparer la turbine avant la fenêtre de limitation.",
        consequenceText: "Capacité V1 limitée de 200 MW jusqu'à la révélation causale.",
        learningText: "Un signal faible anticipé permet d'éviter une limitation coûteuse.",
        signalAtSec: 21600,
        consequenceAtSec: 28800,
        revealCauseAtSec: 36000,
        effectEndsAtSec: 36000,
        deterministicRoll: 37,
        relatedReferenceIds: [valmorneMiddayDeliveryContract.id],
        status: "pending",
        signalEventId: null,
        consequenceEventId: null,
        revealEventId: null,
        avoidedBy: null
      },
      "incident-relief-delay": {
        id: "incident-relief-delay",
        family: "resource",
        targetId: "team-valmorne-b",
        targetGroup: null,
        precondition: "team-valmorne-b has no active reservation before consequence",
        hiddenCause: "Retard logistique fictif sur la relève instrumentation.",
        signalText: "Relève instrumentation annoncée avec retard possible.",
        possibleDecision: "Réserver l'équipe B sur la tâche prioritaire avant la relève.",
        consequenceText: "Équipe B indisponible pendant une heure simulée.",
        learningText: "Une ressource rare doit être réservée avant la fenêtre critique.",
        signalAtSec: 21900,
        consequenceAtSec: 32400,
        revealCauseAtSec: 39600,
        effectEndsAtSec: 36000,
        deterministicRoll: 61,
        relatedReferenceIds: [],
        status: "pending",
        signalEventId: null,
        consequenceEventId: null,
        revealEventId: null,
        avoidedBy: null
      },
      "incident-price-revision": {
        id: "incident-price-revision",
        family: "program-price",
        targetId: "connection-valmorne",
        targetGroup: null,
        precondition: "delivery exposure remains before price spike",
        hiddenCause: "Tension régionale fictive sur l'équilibre offre-demande.",
        signalText: "Prévision extérieure révisée : risque de prix de couverture élevé.",
        possibleDecision: "Réviser le programme ou couvrir le déficit avant le pic de prix.",
        consequenceText: "Le prix extérieur atteint sa nouvelle zone haute sans achat automatique.",
        learningText: "La couverture précoce transforme une incertitude de prix en coût borné.",
        signalAtSec: 46800,
        consequenceAtSec: 54000,
        revealCauseAtSec: 64800,
        effectEndsAtSec: null,
        deterministicRoll: 83,
        relatedReferenceIds: [valmorneEveningDeliveryContract.id],
        status: "pending",
        signalEventId: null,
        consequenceEventId: null,
        revealEventId: null,
        avoidedBy: null
      }
    }
  },
  policies: {},
  transactions: [],
  processedCommandIds: [],
  futureEvents: []
};

export const valmorneObservation: PlayerObservation = {
  simTimeSec: 0,
  visibleAssets: {
    "plant-valmorne": {
      label: "Centrale fictive de Valmorne",
      available: { confidence: "known", value: true, observedAtSec: 0 }
    },
    "connection-valmorne": {
      label: "Raccordement fictif Valmorne",
      available: { confidence: "authorized", value: true, observedAtSec: 0 }
    }
  },
  maintenance: {
    tasks: {},
    equipment: Object.fromEntries(
      Object.entries(maintenanceEquipment).map(([id, item]) => [
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
    )
  },
  economy: {
    currentMarketPriceEurPerMwh: { confidence: "known", value: 120, observedAtSec: 0 },
    forecasts: [
      { forSec: 3600, expectedEurPerMwh: 112.5, uncertaintyEurPerMwh: 15 },
      { forSec: 7200, expectedEurPerMwh: -17.5, uncertaintyEurPerMwh: 15 },
      { forSec: 10800, expectedEurPerMwh: 72.5, uncertaintyEurPerMwh: 15 }
    ],
    commitments: [
      {
        id: valmorneDeliveryContract.id,
        deliveryStartSec: valmorneDeliveryContract.deliveryStartSec,
        deliveryEndSec: valmorneDeliveryContract.deliveryEndSec,
        nominationDeadlineSec: valmorneDeliveryContract.nominationDeadlineSec,
        committedPowerMw: valmorneDeliveryContract.committedPowerMw,
        contractedMwh: 800,
        contractPriceEurPerMwh: valmorneDeliveryContract.contractPriceEurPerMwh,
        settled: false,
        physicalGenerationMwh: 0,
        replacementPurchasedMwh: 0,
        remainingExposureMwh: 800
      },
      {
        id: valmorneMiddayDeliveryContract.id,
        deliveryStartSec: valmorneMiddayDeliveryContract.deliveryStartSec,
        deliveryEndSec: valmorneMiddayDeliveryContract.deliveryEndSec,
        nominationDeadlineSec: valmorneMiddayDeliveryContract.nominationDeadlineSec,
        committedPowerMw: valmorneMiddayDeliveryContract.committedPowerMw,
        contractedMwh: 800,
        contractPriceEurPerMwh: valmorneMiddayDeliveryContract.contractPriceEurPerMwh,
        settled: false,
        physicalGenerationMwh: 0,
        replacementPurchasedMwh: 0,
        remainingExposureMwh: 800
      },
      {
        id: valmorneEveningDeliveryContract.id,
        deliveryStartSec: valmorneEveningDeliveryContract.deliveryStartSec,
        deliveryEndSec: valmorneEveningDeliveryContract.deliveryEndSec,
        nominationDeadlineSec: valmorneEveningDeliveryContract.nominationDeadlineSec,
        committedPowerMw: valmorneEveningDeliveryContract.committedPowerMw,
        contractedMwh: 800,
        contractPriceEurPerMwh: valmorneEveningDeliveryContract.contractPriceEurPerMwh,
        settled: false,
        physicalGenerationMwh: 0,
        replacementPurchasedMwh: 0,
        remainingExposureMwh: 800
      }
    ],
    kpis: {
      cashCents: { value: valmorneWorld.cashCents, references: [] },
      operatingResultCents: { value: 0, references: [] },
      upcomingCommittedMwh: {
        value: 2400,
        references: [
          valmorneDeliveryContract.id,
          valmorneMiddayDeliveryContract.id,
          valmorneEveningDeliveryContract.id
        ]
      },
      imbalanceExposureMwh: {
        value: 2400,
        references: [
          valmorneDeliveryContract.id,
          valmorneMiddayDeliveryContract.id,
          valmorneEveningDeliveryContract.id
        ]
      }
    },
    maintenanceImpacts: {}
  },
  scenario: {
    id: "valmorne-24h-reference",
    title: "Relève sous tension à Valmorne",
    briefing: [
      "Vous prenez la relève pour 24 h sur deux tranches fictives de Valmorne.",
      "Une pointe de livraison approche avec une prévision imparfaite.",
      "Les équipes sont limitées : anticipez maintenance, couverture et indisponibilités."
    ],
    objectives: [
      { id: "delivery", label: "Tenir l'engagement de livraison sans double vente." },
      { id: "maintenance", label: "Traiter les signaux techniques avec une ressource adaptée." },
      { id: "cash", label: "Limiter le coût des écarts et garder une trésorerie explicable." }
    ],
    horizons: {
      now: "Maintenant : état des tranches, alertes et décisions immédiates.",
      medium: "24–72 h : maintenance, engagements, prix et ressources.",
      long: "Mois/années : usure, cycles et arbitrages structurels futurs."
    },
    incidentCards: [],
    alertGroups: [],
    debrief: null
  },
  cashCents: { confidence: "known", value: valmorneWorld.cashCents, observedAtSec: 0 },
  recentEvents: []
};

export const valmorneFixture = {
  id: VALMORNE_FIXTURE_ID,
  contentVersion: CONTENT_VERSION,
  world: valmorneWorld,
  observation: valmorneObservation,
  deliveryContract: valmorneDeliveryContract,
  middayDeliveryContract: valmorneMiddayDeliveryContract,
  eveningDeliveryContract: valmorneEveningDeliveryContract
} as const;
