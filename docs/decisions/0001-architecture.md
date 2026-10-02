# ADR 0001 — Architecture L00

Status: accepted for L00

## Decision

NukeGrid lives under `apps/ovh-primary/nukegrid/` because `k8s-apps` is the operational monorepo, but L00 does **not** add NukeGrid to `apps/ovh-primary/kustomization.yaml`.

The product is separated into:

- `src/contracts`: stable cross-layer types, units, versions and validation boundaries;
- `src/sim`: deterministic engine primitives only, with no DOM, network or wall clock;
- `src/content`: fictitious parameters/fixtures such as Valmorne;
- `src/persistence`: serialization/integrity contracts;
- UI: intentionally absent from L00; future UI consumes `PlayerObservation` and emits commands;
- backend: intentionally absent from the solo baseline.

## Why

This keeps the solo game browser-first and portable while avoiding a Kubernetes dependency. It also gives L01 a clean engine boundary without pretending the indicative Plane tree already existed.

## Consequences

A future web shell may introduce `apps/web` or a package workspace when it exists for a concrete reason. L00 does not pre-create empty abstractions.
