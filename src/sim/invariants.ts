export const GENERAL_INVARIANTS = [
  "energy-is-integral-of-power",
  "zonal-energy-balance-is-reconcilable",
  "unserved-energy-and-curtailment-are-distinct",
  "stocks-never-negative",
  "team-never-double-assigned",
  "part-never-double-consumed",
  "storage-bounded-and-no-simultaneous-charge-discharge",
  "reserve-compatible-with-commitments",
  "transactions-unique",
  "cash-reconcilable-from-transactions",
  "protections-not-bypassable",
  "pause-and-display-speed-do-not-change-results",
  "save-resume-preserves-prng-events-commands-and-commitments"
] as const;
