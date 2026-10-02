# Contributing

[🇬🇧 English](CONTRIBUTING.md) · [🇫🇷 Français](CONTRIBUTING.fr.md)

Contributions are welcome.

## Before you start

For larger gameplay or architecture changes, open a feature request first.

Useful labels:

- `good first issue`;
- `help wanted`;
- `documentation`.

## Development flow

1. Fork the repository.
2. Create a focused branch.
3. Make your change.
4. Run local validation.
5. Open a pull request explaining the change and how it was tested.

## Local checks

Install dependencies:

```bash
npm install --ignore-scripts --no-audit --no-fund
```

Run the full local check:

```bash
npm run check
```

If Docker behavior is affected:

```bash
docker build -t nukegrid:local .
docker run --rm -p 4176:4176 nukegrid:local
curl http://localhost:4176/healthz
```

## GitHub Actions policy

This repository intentionally has **no automatic CI on push or pull requests**.

The only GitHub Actions workflow is:

```text
Publish Docker image to GHCR
```

It runs only when a maintainer manually triggers `workflow_dispatch`.

Its purpose is container publication, not pull-request validation.

Launch path:

```text
GitHub → Actions → Publish Docker image to GHCR → Run workflow
```

See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## NukeGrid-specific notes

The playable server currently stores sessions in process memory.

Keep Kubernetes/Helm deployments at **1 replica** unless your contribution deliberately adds shared session state or an explicit affinity strategy.

## Security and repository hygiene

Do not commit credentials, private endpoints, internal DNS names, secrets or private homelab manifests.

## Pull requests

Keep changes focused and explain:

- what changed;
- why;
- gameplay/UX impact where relevant;
- how it was tested;
- known limitations.

Screenshots are encouraged for UI changes.
