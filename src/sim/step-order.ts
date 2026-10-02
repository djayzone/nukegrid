export const ENGINE_STEP_ORDER = [
  "apply-due-commands-and-events",
  "refresh-weather-demand-availability-observations",
  "evaluate-due-commitments",
  "resolve-feasible-operation-network-and-automatics",
  "integrate-physics-and-settle-due-transactions",
  "advance-wear-tasks-and-risks",
  "schedule-future-events-publish-observations-and-journal"
] as const;
