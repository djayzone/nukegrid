# ADR 0002 — Determinism, idempotence and persistence

Status: accepted for L00

- Simulation time is non-negative integer seconds.
- Business randomness uses only `xorshift32-v1`, whose state is serializable.
- Frames, render speed, DOM and wall-clock time are not simulation inputs.
- Commands carry a unique ID. The engine owns validation. Replaying an already processed ID must not create a second effect.
- Simultaneous work is ordered by simulation time, then by the deterministic queue/order established by the engine implementation. L01 must document the final tie-break key before adding execution.
- Saves carry `schemaVersion`, `engineVersion`, `contentVersion`, world, PRNG state, future events, policies, transactions, processed command IDs and checksum.
- The L00 checksum is `fnv1a32-v1`: corruption detection only, not authentication.
- No cross-version replay/save compatibility is promised. A schema/engine/content version change requires an explicit compatibility rule or migration before being advertised as supported.
