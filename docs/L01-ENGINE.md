# NG-L01 — deterministic engine and Worker bridge

## Scope

This lot implements Plane **NUKEGAME-2 / NG-L01** on top of the integrated L00 contracts. It adds the single deterministic simulation clock/engine, stable due-item ordering, command idempotence at the engine boundary, a journal, and an interruptible Worker-facing runtime. It does not add network physics, frequency dynamics, user save UX, backend services or Kubernetes runtime.

## Engine API

`DeterministicEngine` owns the mutable simulation truth internally and exposes cloned snapshots/observations.

- `submit(command)` validates once at the engine boundary and returns a stable `CommandResult`.
- accepted non-`AdvanceUntil` commands execute immediately or are queued for their target simulated second;
- `AdvanceUntil` must execute at the current simulated second and advances toward its payload target;
- `advanceUntil(targetSec)` processes all due work at exact integer simulated seconds;
- `scheduleEvent(event)` adds future events without reading wall-clock time;
- `observation()` derives a `PlayerObservation` without consuming PRNG state;
- `snapshot()` returns world, PRNG, pending commands and journal for deterministic comparison.

The engine has no DOM, network or wall-clock dependency.

## Time and speed

L01 uses exact integer simulated seconds. There is no sub-second physics yet. Between due items the engine may jump directly to the next exact second because no continuous L01 physics exists. Later physical models may introduce explicit sub-steps without changing command/event ordering.

`SimulationClock` is only a pacing policy. A speed changes the amount of simulated-second budget offered per host pulse; it never changes engine rules. Pause returns a zero budget and therefore consumes no simulated time.

## Stable ordering

The L00 open decision is fixed for L01 as follows:

1. earliest simulated second;
2. commands before events at the same second, matching phase 1 of the frozen step order;
3. command IDs in lexical order;
4. event IDs in lexical order.

Queue IDs are unique. The ordering is independent from UI render frequency and insertion order.

## Idempotence and journal

The engine checks the in-memory command ledger before validation. Re-submitting the same command ID returns the original result and produces no second execution. Accepted IDs are also appended once to `WorldState.processedCommandIds`. The journal records deterministic command execution/rejection, events and important-event stops.

Persisted restoration of historical `CommandResult` objects remains outside L01 save UX; an already present processed ID is still rejected by L00 validation.

## Important-event interruption

By default, `advanceUntil` stops after all simultaneous events at a second have been processed when at least one event has severity `warning` or `critical`. Callers may disable that stop for deterministic batch verification. Later lots can add explicit commitment/delegation decision barriers.

## Worker bridge

`EngineWorkerRuntime` exposes typed `submit`, `advance`, `cancel` and `snapshot` messages. Large advances are split into deterministic chunks. Between chunks the runtime yields to the host event loop; that scheduling yield never contributes to simulated time or PRNG state. A cancel message is therefore observable before the next chunk and a large advance does not require one blocking synchronous loop.

`attachEngineWorker` binds the runtime to a minimal Worker-like port without importing DOM types into the simulation engine.

## Versioning

- `CONTRACT_VERSION`: unchanged at 1;
- `SCHEMA_VERSION`: unchanged at 1;
- `PRNG_VERSION`: unchanged at `xorshift32-v1`;
- `CONTENT_VERSION`: unchanged at `valmorne-l00-v1`;
- `ENGINE_VERSION`: bumped to `0.1.0-l01`.

No save migration is required because the schema and contract shapes are unchanged.

## Acceptance evidence

`test/l01.test.ts` covers:

- identical 24-hour state for the same seed/commands at 1x and 20x pacing;
- pause consuming zero simulated time;
- executable `AdvanceUntil`;
- duplicate command ID producing no second effect;
- deterministic simultaneous command/event order;
- observations/render reads leaving time and PRNG untouched;
- interruption on important events;
- chunked Worker advance yielding and accepting cancellation.
