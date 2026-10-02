import { assertFiniteNonNegative, energyFromConstantPower, eurosPerMwhToCents, type EuroPerMegawattHour, type Megawatts, type MegawattHours, type MoneyCents, type SimSeconds } from "./units.js";

export interface PrototypeDeliveryContract {
  readonly id: string;
  readonly zoneId: string;
  readonly deliveryStartSec: SimSeconds;
  readonly deliveryEndSec: SimSeconds;
  readonly nominationDeadlineSec: SimSeconds;
  readonly committedPowerMw: Megawatts;
  readonly contractPriceEurPerMwh: EuroPerMegawattHour;
  readonly settlementDelaySec: SimSeconds;
  readonly shortImbalancePriceEurPerMwh: EuroPerMegawattHour;
  readonly longImbalancePriceEurPerMwh: EuroPerMegawattHour;
}

export interface DeliverySettlement {
  readonly contractedMwh: MegawattHours;
  readonly deliveredMwh: MegawattHours;
  readonly shortfallMwh: MegawattHours;
  readonly surplusMwh: MegawattHours;
  readonly contractRevenueCents: MoneyCents;
  readonly imbalanceCents: MoneyCents;
  readonly settlementDueSec: SimSeconds;
}

export function contractVolumeMwh(contract: PrototypeDeliveryContract): MegawattHours {
  return energyFromConstantPower(
    contract.committedPowerMw,
    contract.deliveryEndSec - contract.deliveryStartSec
  );
}

export function settlePrototypeDelivery(
  contract: PrototypeDeliveryContract,
  deliveredMwh: MegawattHours
): DeliverySettlement {
  assertFiniteNonNegative(deliveredMwh, "DELIVERY_DELIVERED_MWH_INVALID");
  const contractedMwh = contractVolumeMwh(contract);
  const shortfallMwh = Math.max(0, contractedMwh - deliveredMwh);
  const surplusMwh = Math.max(0, deliveredMwh - contractedMwh);
  const contractRevenueCents = eurosPerMwhToCents(
    Math.min(deliveredMwh, contractedMwh),
    contract.contractPriceEurPerMwh
  );
  const shortCost = eurosPerMwhToCents(shortfallMwh, contract.shortImbalancePriceEurPerMwh);
  const longCredit = eurosPerMwhToCents(surplusMwh, contract.longImbalancePriceEurPerMwh);
  return {
    contractedMwh,
    deliveredMwh,
    shortfallMwh,
    surplusMwh,
    contractRevenueCents,
    imbalanceCents: longCredit - shortCost,
    settlementDueSec: contract.deliveryEndSec + contract.settlementDelaySec
  };
}


export interface ReconciledDeliverySettlement extends DeliverySettlement {
  readonly physicalGenerationMwh: MegawattHours;
  readonly physicalAllocatedMwh: MegawattHours;
  readonly replacementPurchasedMwh: MegawattHours;
  readonly replacementAppliedMwh: MegawattHours;
  readonly unusedReplacementMwh: MegawattHours;
}

export function settleDeliveryWithReplacement(
  contract: PrototypeDeliveryContract,
  physicalGenerationMwh: MegawattHours,
  replacementPurchasedMwh: MegawattHours
): ReconciledDeliverySettlement {
  assertFiniteNonNegative(physicalGenerationMwh, "DELIVERY_PHYSICAL_MWH_INVALID");
  assertFiniteNonNegative(replacementPurchasedMwh, "DELIVERY_REPLACEMENT_MWH_INVALID");

  const contractedMwh = contractVolumeMwh(contract);
  const physicalAllocatedMwh = Math.min(physicalGenerationMwh, contractedMwh);
  const remainingMwh = Math.max(0, contractedMwh - physicalAllocatedMwh);
  const replacementAppliedMwh = Math.min(replacementPurchasedMwh, remainingMwh);
  const unusedReplacementMwh = Math.max(0, replacementPurchasedMwh - replacementAppliedMwh);
  const deliveredMwh = physicalAllocatedMwh + replacementAppliedMwh;
  const shortfallMwh = Math.max(0, contractedMwh - deliveredMwh);
  const surplusMwh = Math.max(0, physicalGenerationMwh - contractedMwh);

  const contractRevenueCents = eurosPerMwhToCents(deliveredMwh, contract.contractPriceEurPerMwh);
  const shortCostCents = eurosPerMwhToCents(shortfallMwh, contract.shortImbalancePriceEurPerMwh);
  const surplusCreditCents = eurosPerMwhToCents(surplusMwh, contract.longImbalancePriceEurPerMwh);

  return {
    contractedMwh,
    deliveredMwh,
    physicalGenerationMwh,
    physicalAllocatedMwh,
    replacementPurchasedMwh,
    replacementAppliedMwh,
    unusedReplacementMwh,
    shortfallMwh,
    surplusMwh,
    contractRevenueCents,
    imbalanceCents: surplusCreditCents - shortCostCents,
    settlementDueSec: contract.deliveryEndSec + contract.settlementDelaySec
  };
}
