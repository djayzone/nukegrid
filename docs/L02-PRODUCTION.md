# NG-L02 — production units and achievable output

## Scope

This lot implements Plane **NUKEGAME-3 / NG-L02** on top of the deterministic L01 engine. It models two fictitious Valmorne production units without reproducing a professional control room or detailed reactor physics.

Each unit exposes four functional groups:

1. abstract nuclear island;
2. turbine;
3. generator;
4. grid connection.

The model uses net electrical power consistently. Internal thermal phenomena, detailed core behavior and decorative sensors remain out of scope.

## Operating states

The production state machine is:

`stopped -> start-preparation -> producing`

`producing <-> limited`

`producing|limited -> planned-shutdown -> stopped`

`forced-outage -> return-tests -> producing`

Durations are deterministic:

| Transition | Duration |
| --- | ---: |
| stopped -> start-preparation | 900 s |
| start-preparation -> stopped | 300 s |
| start-preparation -> producing | 1800 s |
| producing <-> limited | immediate |
| producing/limited -> planned-shutdown | 900 s |
| planned-shutdown -> stopped | 900 s |
| forced-outage -> return-tests | 1800 s |
| return-tests -> producing | 1800 s |

Start preparation, return tests and entry to normal production require every functional group to be available. Entry to `producing` also requires full nominal availability; otherwise the stable rejection proposes `limited`.

Transitions are requested with the typed `RequestUnitState` command at the current simulated second. A forbidden transition returns `COMMAND_TRANSITION_FORBIDDEN` with the current state, requested state, reason and a legal alternative. Protections are therefore not bypassable by the caller.

## Power scheduling and ramps

`SetPowerSchedule` is issued at the current simulated second and carries strictly increasing absolute simulated-second setpoints. The latest accepted command replaces the remaining schedule for that unit.

A setpoint above current available capacity is rejected as `COMMAND_POWER_UNAVAILABLE` and returns `alternativeNetPowerMw`. The engine never silently clips an impossible operator request at the command boundary.

Realized output moves toward the effective target using deterministic MW/hour ramp limits. During stopped, preparation, shutdown, forced outage, return tests or an active transition, the effective target is zero. In `producing` or `limited`, the target is the minimum of planned, available and nominal net power.

Energy is integrated from realized net power, not from the requested setpoint. Linear ramp intervals use the exact trapezoid and steady-state areas for the interval. This keeps MWh recomposable from the simulated power trajectory.

## Deterministic integration

Production schedule points and transition completions are first-class deterministic engine boundaries alongside queued commands and events. The engine advances physical production to the next exact boundary, processes due work, applies the production boundary, then continues.

No wall-clock time, render cadence, DOM state, network input or PRNG read affects production integration.

## Minimal diagnostic observation

`PlayerObservation.visibleAssets[*].productionUnit` exposes only observable production state:

- operating state;
- nominal, available, planned and realized net MW;
- cumulative generated MWh;
- availability of the four functional groups;
- a compact diagnostic status and reasons.

The UI still consumes `PlayerObservation`; it does not inspect hidden/future `WorldState`.

## Valmorne fixture

The fictitious plant now contains:

- Valmorne 1: 900 MW net nominal, 300 MW/h ramps;
- Valmorne 2: 850 MW net nominal, 250 MW/h ramps.

Both start stopped with all four functional groups available. These are gameplay fixtures, not real industrial parameters.

## Versioning

- `CONTRACT_VERSION`: **2**, because `RequestUnitState` and stable production rejection codes were added;
- `ENGINE_VERSION`: **0.2.0-l02**;
- `CONTENT_VERSION`: **valmorne-l02-v1**;
- `SCHEMA_VERSION`: remains **1** because production data is an additive optional extension of existing asset serialization and the save envelope is unchanged;
- `PRNG_VERSION`: unchanged.

No save migration is required by this additive shape. Older schema-v1 saves without production-unit extensions remain structurally valid; they simply do not contain L02 production units.

## Acceptance evidence

`test/l02.test.ts` proves:

- two units and four functional groups per unit;
- stopped output remains zero;
- impossible setpoints reject with an actionable alternative;
- ramps constrain realized MW;
- forbidden transitions reject and valid transition durations are observed;
- 100 MW × 2 h recomposes to 200 MWh;
- the minimal diagnostic is exposed through `PlayerObservation`.

L03 may consume the production-unit state, transition command, power schedule semantics and observation diagnostic without redefining them.
