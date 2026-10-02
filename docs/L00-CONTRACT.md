# NG-L00 — executable contract

## Repository inventory

At L00 start there was no NukeGrid directory on `main`. Relevant repository conventions come from root `AGENTS.md`: Plane drives work, GitHub drives implementation, dedicated branches/PRs are mandatory, proof must be real, and Kubernetes is not a substitute for source changes. Existing game-like neighbors (`sim-lab`, `webwars`) are application-specific and are not copied wholesale.

## Frozen boundaries

**Simulation** owns validation, causal effects, idempotence, invariants, deterministic ordering and PRNG use.  
**Content** owns fictitious parameters, scenario data and labels.  
**UI** may only consume `PlayerObservation` and emit typed commands; it must never read hidden/future `WorldState`.  
**Persistence** serializes engine state and checks corruption; it does not add gameplay rules.

## Units

- time: integer simulated seconds;
- net power at connection: MW;
- energy: MWh;
- price: €/MWh;
- money: integer cents;
- storage: MW power and MWh energy are separate;
- rates: temporal base is explicit;
- display rounding never feeds business calculations.

## Commands

Initial discriminated union: `SetPowerSchedule`, `ScheduleMaintenance`, `AssignTeam`, `BuyReplacementEnergy`, `SetDelegationPolicy`, `AdvanceUntil`.

Every command has ID, contract version, actor, target, target simulated time and typed payload. Validation is engine-owned. Results are `accepted`, `rejected` with stable code/parameters, or `adjusted` with explicit `COMMAND_BOUNDED` parameters.

## Events and causality

Events have ID, contract version, simulated time, involved entities, causal parent, severity and typed payload. L00 defines enough event types for the required causal chain:

`FaultDetected -> OutputLimited -> EnergyShortfall -> ReplacementEnergyPurchased -> CashChanged`.

It does not implement the chain.

## Prototype delivery contract

The prototype contract is a fixed-power delivery window. Contracted MWh = MW × seconds / 3600. Nomination deadline is an absolute simulated second before delivery. Settlement occurs at `deliveryEndSec + settlementDelaySec`.

For L00 settlement math only:

- delivered energy up to the contracted volume earns contract price;
- short energy is charged at `shortImbalancePriceEurPerMwh`;
- surplus is credited at `longImbalancePriceEurPerMwh`;
- shortfall and surplus are distinct;
- one physical MWh must never satisfy two sales; L01+ must preserve transaction/commitment uniqueness when execution exists.

The Valmorne fixture uses one one-hour 800 MW fictitious commitment, 70 €/MWh contract price, 130 €/MWh short price and 40 €/MWh surplus price. These are gameplay fixtures, not real industrial data.

## General invariants

The executable invariant catalogue freezes the cross-lot rules: energy integrates power, zonal balances reconcile, unserved/curtailed energy differ, no negative stock, no double team/part use, bounded storage with exclusive charge/discharge, reserve/commitment consistency, transaction uniqueness, reconcilable cash, non-bypassable protections, pause/display-speed neutrality and save/resume preservation.

## Logical engine step order

1. due commands/events;
2. weather/demand/availability/observations;
3. due commitments;
4. feasible operation/network/automatics;
5. physical integration and due settlements;
6. wear/tasks/risks;
7. future events, observations and journal.

L00 only freezes this order. It does not implement the engine loop, network or frequency.

## Save limits

Schema v1 contains versions, simulated time, WorldState, PRNG, event queue, policies, transactions, processed command IDs and checksum. FNV-1a is only corruption detection. There is no migration framework yet and therefore no compatibility promise across incompatible versions.

## Performance reference for future lots

Measurements must report at least: Git SHA, engine/content/schema versions, Node version, CPU model/core count, RAM, OS/architecture, scenario fixture, simulated duration, step policy, wall duration and peak RSS. The reference CI environment for comparable automated measurements is the repository Dagger K3s `standard` job class (1 CPU / 1 GiB budget as documented by the platform). Performance claims must not mix local desktop and Dagger numbers without labeling them.

## Open decisions for later lots

- final simultaneous-command tie-break beyond deterministic queue insertion;
- browser bundler/UI framework;
- IndexedDB adapter and migration mechanism;
- dynamic network/frequency model;
- production deployment shape.

These are intentionally not decided in L00.

## L01 consumption

L01 can directly consume command/event unions, versions, units, WorldState/PlayerObservation, validation result shape, command ledger, PRNG serialization, invariants, step order, save schema and Valmorne fixture. L01 must not change these silently; contract/schema changes require versioning and documentation.
