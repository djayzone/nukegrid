import type { BuyReplacementEnergyCommand, RejectionCode } from "../contracts/commands.js";
import {
  contractVolumeMwh,
  settleDeliveryWithReplacement
} from "../contracts/delivery.js";
import { baseEventFields, type GameEvent } from "../contracts/events.js";
import type { ReplacementEnergyPurchase } from "../contracts/economy.js";
import {
  energyFromConstantPower,
  eurosPerMwhToCents,
  type MegawattHours,
  type SimSeconds
} from "../contracts/units.js";
import type { PlayerObservation, WorldState } from "../contracts/world.js";

export interface EconomyCommandRejection {
  readonly code: RejectionCode;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface EconomyMutation {
  readonly world: WorldState;
  readonly events: readonly GameEvent[];
}

export function marketPriceAt(world: WorldState, atSec: SimSeconds): number {
  const curve = world.economy.marketPriceCurve;
  if (curve.length === 0) throw new Error("ECONOMY_MARKET_CURVE_EMPTY");
  let selected = curve[0]!;
  for (const point of curve) {
    if (point.atSec > atSec) break;
    selected = point;
  }
  return selected.priceEurPerMwh;
}

export function forecastPriceAt(
  world: WorldState,
  forSec: SimSeconds
): { readonly expectedEurPerMwh: number; readonly uncertaintyEurPerMwh: number } {
  const actualReference = marketPriceAt(world, forSec);
  const uncertainty = world.economy.forecastUncertaintyEurPerMwh;
  const bucket = Math.floor(forSec / 3600);
  const deterministicBias = (bucket % 2 === 0 ? 0.5 : -0.5) * uncertainty;
  return {
    expectedEurPerMwh: actualReference + deterministicBias,
    uncertaintyEurPerMwh: uncertainty
  };
}

export function replacementEnergyCostCents(
  powerMw: number,
  deliveryStartSec: SimSeconds,
  deliveryEndSec: SimSeconds,
  priceEurPerMwh: number
): number {
  const energyMwh = energyFromConstantPower(powerMw, deliveryEndSec - deliveryStartSec);
  return eurosPerMwhToCents(energyMwh, priceEurPerMwh);
}

function replacementPurchasedMwh(world: WorldState, contractId: string): MegawattHours {
  return Object.values(world.economy.replacementPurchases)
    .filter((purchase) => purchase.contractId === contractId)
    .reduce((sum, purchase) => sum + purchase.energyMwh, 0);
}

export function checkReplacementEnergyCommand(
  world: WorldState,
  command: BuyReplacementEnergyCommand
): EconomyCommandRejection | null {
  if (command.targetSimTimeSec !== world.simTimeSec) {
    return {
      code: "COMMAND_INVARIANT_VIOLATION",
      parameters: { reason: "replacement-energy-command-must-execute-at-current-time", now: world.simTimeSec }
    };
  }
  const contract = world.economy.deliveryContracts[command.payload.contractId];
  const ledger = world.economy.deliveryLedgers[command.payload.contractId];
  if (!contract || !ledger) {
    return {
      code: "COMMAND_TARGET_UNKNOWN",
      parameters: { reason: "delivery-contract-unknown", contractId: command.payload.contractId }
    };
  }
  if (ledger.settled) {
    return {
      code: "COMMAND_DELIVERY_ALREADY_SETTLED",
      parameters: { contractId: contract.id }
    };
  }
  if (
    command.payload.deliveryStartSec < world.simTimeSec ||
    command.payload.deliveryStartSec < contract.deliveryStartSec ||
    command.payload.deliveryEndSec > contract.deliveryEndSec
  ) {
    return {
      code: "COMMAND_DELIVERY_WINDOW_INVALID",
      parameters: {
        reason: "replacement-window-outside-contract",
        contractId: contract.id,
        contractStartSec: contract.deliveryStartSec,
        contractEndSec: contract.deliveryEndSec
      }
    };
  }

  const energyMwh = energyFromConstantPower(
    command.payload.powerMw,
    command.payload.deliveryEndSec - command.payload.deliveryStartSec
  );
  const alreadyPurchasedMwh = replacementPurchasedMwh(world, contract.id);
  const maxEnergyMwh = Math.min(
    contractVolumeMwh(contract),
    world.economy.maxReplacementEnergyMwhPerContract
  );
  if (
    command.payload.powerMw > world.economy.maxReplacementPowerMw ||
    alreadyPurchasedMwh + energyMwh > maxEnergyMwh
  ) {
    return {
      code: "COMMAND_MARKET_LIQUIDITY_LIMIT",
      parameters: {
        maxPowerMw: world.economy.maxReplacementPowerMw,
        maxEnergyMwh,
        alreadyPurchasedMwh
      }
    };
  }

  const priceEurPerMwh = marketPriceAt(world, world.simTimeSec);
  if (priceEurPerMwh > command.payload.maxPriceEurPerMwh) {
    return {
      code: "COMMAND_MARKET_PRICE_LIMIT",
      parameters: {
        marketPriceEurPerMwh: priceEurPerMwh,
        maxPriceEurPerMwh: command.payload.maxPriceEurPerMwh
      }
    };
  }

  const costCents = eurosPerMwhToCents(energyMwh, priceEurPerMwh);
  if (costCents > world.cashCents) {
    return {
      code: "COMMAND_CASH_INSUFFICIENT",
      parameters: { requiredCents: costCents, availableCents: world.cashCents }
    };
  }
  return null;
}

export function buyReplacementEnergy(
  world: WorldState,
  command: BuyReplacementEnergyCommand
): EconomyMutation {
  const priceEurPerMwh = marketPriceAt(world, world.simTimeSec);
  const energyMwh = energyFromConstantPower(
    command.payload.powerMw,
    command.payload.deliveryEndSec - command.payload.deliveryStartSec
  );
  const costCents = eurosPerMwhToCents(energyMwh, priceEurPerMwh);
  const purchase: ReplacementEnergyPurchase = {
    id: command.id,
    contractId: command.payload.contractId,
    purchasedAtSec: world.simTimeSec,
    deliveryStartSec: command.payload.deliveryStartSec,
    deliveryEndSec: command.payload.deliveryEndSec,
    powerMw: command.payload.powerMw,
    energyMwh,
    priceEurPerMwh,
    costCents
  };
  const next: WorldState = {
    ...world,
    cashCents: world.cashCents - costCents,
    economy: {
      ...world.economy,
      replacementPurchases: {
        ...world.economy.replacementPurchases,
        [purchase.id]: purchase
      }
    },
    transactions: [
      ...world.transactions,
      {
        id: `replacement:${purchase.id}`,
        atSec: world.simTimeSec,
        kind: "replacement-energy",
        amountCents: -costCents,
        referenceId: purchase.id
      }
    ]
  };
  const purchased: GameEvent = {
    ...baseEventFields(
      `replacement:${purchase.id}:purchased`,
      world.simTimeSec,
      [command.targetId],
      null,
      "notice"
    ),
    type: "ReplacementEnergyPurchased",
    payload: { energyMwh, priceEurPerMwh }
  };
  const cash: GameEvent = {
    ...baseEventFields(
      `replacement:${purchase.id}:cash`,
      world.simTimeSec,
      [command.targetId],
      purchased.id,
      "info"
    ),
    type: "CashChanged",
    payload: { deltaCents: -costCents, reason: "replacement-energy-purchase" }
  };
  return { world: next, events: [purchased, cash] };
}

export function totalGeneratedMwh(world: WorldState): MegawattHours {
  return Object.values(world.assets)
    .reduce((sum, asset) => sum + (asset.productionUnit?.generatedMwh ?? 0), 0);
}

export function accumulateDeliveryGeneration(
  world: WorldState,
  fromSec: SimSeconds,
  toSec: SimSeconds,
  generatedDeltaMwh: MegawattHours
): WorldState {
  if (toSec <= fromSec || generatedDeltaMwh <= 0) return world;
  const intervalSec = toSec - fromSec;
  let next = world;
  for (const contract of Object.values(world.economy.deliveryContracts)) {
    const ledger = next.economy.deliveryLedgers[contract.id];
    if (!ledger || ledger.settled) continue;
    const overlapSec = Math.max(
      0,
      Math.min(toSec, contract.deliveryEndSec) - Math.max(fromSec, contract.deliveryStartSec)
    );
    if (overlapSec <= 0) continue;
    const allocatedMwh = generatedDeltaMwh * overlapSec / intervalSec;
    next = {
      ...next,
      economy: {
        ...next.economy,
        deliveryLedgers: {
          ...next.economy.deliveryLedgers,
          [contract.id]: {
            ...ledger,
            physicalGenerationMwh: ledger.physicalGenerationMwh + allocatedMwh
          }
        }
      }
    };
  }
  return next;
}

export function nextEconomyBoundaryAt(world: WorldState): SimSeconds | null {
  let next = Number.POSITIVE_INFINITY;
  for (const contract of Object.values(world.economy.deliveryContracts)) {
    const ledger = world.economy.deliveryLedgers[contract.id];
    if (!ledger?.settled) {
      for (const atSec of [
        contract.deliveryStartSec,
        contract.deliveryEndSec,
        contract.deliveryEndSec + contract.settlementDelaySec
      ]) {
        if (atSec > world.simTimeSec) next = Math.min(next, atSec);
      }
    }
  }
  return Number.isFinite(next) ? next : null;
}

export function applyEconomyBoundaries(world: WorldState): EconomyMutation {
  let next = world;
  const events: GameEvent[] = [];
  for (const contractId of Object.keys(world.economy.deliveryContracts).sort()) {
    const contract = next.economy.deliveryContracts[contractId]!;
    const ledger = next.economy.deliveryLedgers[contractId]!;
    const settlementDueSec = contract.deliveryEndSec + contract.settlementDelaySec;
    if (ledger.settled || settlementDueSec > next.simTimeSec) continue;

    const purchasedMwh = replacementPurchasedMwh(next, contractId);
    const settlement = settleDeliveryWithReplacement(
      contract,
      ledger.physicalGenerationMwh,
      purchasedMwh
    );
    const revenueTxId = `contract:${contractId}:revenue`;
    const imbalanceTxId = `contract:${contractId}:imbalance`;
    const netCashDeltaCents = settlement.contractRevenueCents + settlement.imbalanceCents;

    next = {
      ...next,
      cashCents: next.cashCents + netCashDeltaCents,
      economy: {
        ...next.economy,
        deliveryLedgers: {
          ...next.economy.deliveryLedgers,
          [contractId]: {
            ...ledger,
            settled: true,
            settlement
          }
        }
      },
      transactions: [
        ...next.transactions,
        {
          id: revenueTxId,
          atSec: next.simTimeSec,
          kind: "contract-settlement",
          amountCents: settlement.contractRevenueCents,
          referenceId: contractId
        },
        {
          id: imbalanceTxId,
          atSec: next.simTimeSec,
          kind: "imbalance",
          amountCents: settlement.imbalanceCents,
          referenceId: contractId
        }
      ]
    };

    const settled: GameEvent = {
      ...baseEventFields(
        `contract:${contractId}:settled`,
        next.simTimeSec,
        ["plant-valmorne"],
        null,
        "notice"
      ),
      type: "DeliverySettled",
      payload: {
        contractId,
        contractedMwh: settlement.contractedMwh,
        physicalGenerationMwh: settlement.physicalGenerationMwh,
        replacementAppliedMwh: settlement.replacementAppliedMwh,
        shortfallMwh: settlement.shortfallMwh,
        surplusMwh: settlement.surplusMwh,
        netCashDeltaCents
      }
    };
    const cash: GameEvent = {
      ...baseEventFields(
        `contract:${contractId}:cash`,
        next.simTimeSec,
        ["plant-valmorne"],
        settled.id,
        "info"
      ),
      type: "CashChanged",
      payload: { deltaCents: netCashDeltaCents, reason: "delivery-settlement" }
    };
    events.push(settled, cash);
  }
  return { world: next, events };
}

export function economyObservation(world: WorldState): PlayerObservation["economy"] {
  const transactionIds = world.transactions.map((tx) => tx.id);
  const operatingResultCents = world.transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
  const upcomingContracts = Object.values(world.economy.deliveryContracts)
    .filter((contract) => contract.deliveryEndSec > world.simTimeSec);
  const unsettled = Object.values(world.economy.deliveryLedgers)
    .filter((ledger) => !ledger.settled);

  const upcomingCommittedMwh = upcomingContracts
    .reduce((sum, contract) => sum + contractVolumeMwh(contract), 0);
  const imbalanceExposureMwh = unsettled.reduce((sum, ledger) => {
    const contract = world.economy.deliveryContracts[ledger.contractId]!;
    const purchased = replacementPurchasedMwh(world, ledger.contractId);
    return sum + Math.max(0, contractVolumeMwh(contract) - ledger.physicalGenerationMwh - purchased);
  }, 0);

  const maintenanceImpacts = Object.fromEntries(
    Object.entries(world.maintenance.tasks).map(([id, task]) => {
      const forecast = forecastPriceAt(world, task.startsAtSec);
      const estimatedReplacementCostCents = eurosPerMwhToCents(
        task.estimatedLostGenerationMwh,
        forecast.expectedEurPerMwh
      );
      return [
        id,
        {
          committedCostCents: task.committedCostCents,
          estimatedLostGenerationMwh: task.estimatedLostGenerationMwh,
          estimatedReplacementCostCents,
          references: [id]
        }
      ];
    })
  );

  return {
    currentMarketPriceEurPerMwh: {
      confidence: "known",
      value: marketPriceAt(world, world.simTimeSec),
      observedAtSec: world.simTimeSec
    },
    forecasts: [1, 2, 3].map((offsetHours) => {
      const forSec = world.simTimeSec + offsetHours * 3600;
      const forecast = forecastPriceAt(world, forSec);
      return { forSec, ...forecast };
    }),
    commitments: Object.values(world.economy.deliveryContracts)
      .sort((a, b) => a.deliveryStartSec - b.deliveryStartSec || a.id.localeCompare(b.id))
      .map((contract) => {
        const ledger = world.economy.deliveryLedgers[contract.id]!;
        const replacementMwh = replacementPurchasedMwh(world, contract.id);
        const contractedMwh = contractVolumeMwh(contract);
        return {
          id: contract.id,
          deliveryStartSec: contract.deliveryStartSec,
          deliveryEndSec: contract.deliveryEndSec,
          nominationDeadlineSec: contract.nominationDeadlineSec,
          committedPowerMw: contract.committedPowerMw,
          contractedMwh,
          contractPriceEurPerMwh: contract.contractPriceEurPerMwh,
          settled: ledger.settled,
          physicalGenerationMwh: ledger.physicalGenerationMwh,
          replacementPurchasedMwh: replacementMwh,
          remainingExposureMwh: Math.max(
            0,
            contractedMwh - ledger.physicalGenerationMwh - replacementMwh
          )
        };
      }),
    kpis: {
      cashCents: { value: world.cashCents, references: transactionIds },
      operatingResultCents: { value: operatingResultCents, references: transactionIds },
      upcomingCommittedMwh: {
        value: upcomingCommittedMwh,
        references: upcomingContracts.map((contract) => contract.id)
      },
      imbalanceExposureMwh: {
        value: imbalanceExposureMwh,
        references: unsettled.map((ledger) => ledger.contractId)
      }
    },
    maintenanceImpacts
  };
}
