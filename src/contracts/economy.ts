import type { ReconciledDeliverySettlement, PrototypeDeliveryContract } from "./delivery.js";
import type {
  EuroPerMegawattHour,
  MegawattHours,
  Megawatts,
  MoneyCents,
  SimSeconds
} from "./units.js";

export interface MarketPricePoint {
  readonly atSec: SimSeconds;
  readonly priceEurPerMwh: EuroPerMegawattHour;
}

export interface ReplacementEnergyPurchase {
  readonly id: string;
  readonly contractId: string;
  readonly purchasedAtSec: SimSeconds;
  readonly deliveryStartSec: SimSeconds;
  readonly deliveryEndSec: SimSeconds;
  readonly powerMw: Megawatts;
  readonly energyMwh: MegawattHours;
  readonly priceEurPerMwh: EuroPerMegawattHour;
  readonly costCents: MoneyCents;
}

export interface DeliveryLedgerState {
  readonly contractId: string;
  readonly physicalGenerationMwh: MegawattHours;
  readonly settled: boolean;
  readonly settlement: ReconciledDeliverySettlement | null;
}

export interface EconomyState {
  readonly openingCashCents: MoneyCents;
  readonly deliveryContracts: Readonly<Record<string, PrototypeDeliveryContract>>;
  readonly deliveryLedgers: Readonly<Record<string, DeliveryLedgerState>>;
  readonly replacementPurchases: Readonly<Record<string, ReplacementEnergyPurchase>>;
  readonly marketPriceCurve: readonly MarketPricePoint[];
  readonly forecastUncertaintyEurPerMwh: EuroPerMegawattHour;
  readonly maxReplacementPowerMw: Megawatts;
  readonly maxReplacementEnergyMwhPerContract: MegawattHours;
}
