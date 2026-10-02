export type SimSeconds = number;
export type Megawatts = number;
export type MegawattHours = number;
export type EuroPerMegawattHour = number;
export type MoneyCents = number;

export interface RatePerHour {
  readonly value: number;
  readonly timeBase: "per-hour";
}

export interface StorageCapacity {
  readonly maxChargeMw: Megawatts;
  readonly maxDischargeMw: Megawatts;
  readonly energyCapacityMwh: MegawattHours;
}

export function assertIntegerSimSeconds(value: number): asserts value is SimSeconds {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("UNIT_SIM_SECONDS_INVALID");
  }
}

export function assertFiniteNonNegative(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
}

export function energyFromConstantPower(powerMw: Megawatts, durationSec: SimSeconds): MegawattHours {
  assertFiniteNonNegative(powerMw, "UNIT_POWER_MW_INVALID");
  assertIntegerSimSeconds(durationSec);
  return powerMw * durationSec / 3600;
}

export function eurosPerMwhToCents(energyMwh: MegawattHours, price: EuroPerMegawattHour): MoneyCents {
  assertFiniteNonNegative(energyMwh, "UNIT_ENERGY_MWH_INVALID");
  if (!Number.isFinite(price)) throw new Error("UNIT_PRICE_EUR_PER_MWH_INVALID");
  return Math.round(energyMwh * price * 100);
}
