<div align="center">

# NukeGrid

### A deterministic nuclear power and electrical-grid management game prototype.

**Balance production, maintenance, incidents, delivery commitments and economics under pressure.**

[🇬🇧 English](README.md) · [🇫🇷 Français](README.fr.md)

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-24%2B-339933)
![TypeScript](https://img.shields.io/badge/typescript-ready-3178C6)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)
![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326CE5)
![Status](https://img.shields.io/badge/status-community--maintained-purple)

</div>

---

## About

**NukeGrid** is an experimental deterministic management game about electrical production, maintenance, incidents, delivery commitments and grid economics.

The project is no longer developed as an official first-party product, but it remains **open to forks, issues and pull requests**.

> New here? Use Docker Compose. It is the easiest way to run the game without installing Node.js.

## Quick start

| Method | Best for | Main command |
|---|---|---|
| **Docker Compose** | Beginners | `docker compose up --build` |
| **Docker** | Docker users | `docker build -t nukegrid:local .` |
| **Local Node.js** | Developers | `npm run start:playable` |
| **Kubernetes** | Homelabs / clusters | see [docs/KUBERNETES.md](docs/KUBERNETES.md) |

### Recommended: Docker Compose

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
docker compose up --build
```

Then open **http://localhost:4176**.

## Docker

Step-by-step beginner guide:

**[docs/DOCKER.md](docs/DOCKER.md)**

Short version:

```bash
docker build -t nukegrid:local .
docker run --rm -p 4176:4176 nukegrid:local
```

## Kubernetes

A generic ready-to-use manifest is provided in `deploy/kubernetes/`.

Quick local test with **kind**:

```bash
docker build -t nukegrid:local .
kind create cluster --name nukegrid
kind load docker-image nukegrid:local --name nukegrid
kubectl apply -f deploy/kubernetes/
kubectl -n nukegrid port-forward svc/nukegrid 4176:4176
```

Then open **http://localhost:4176**.

Full guide:

**[docs/KUBERNETES.md](docs/KUBERNETES.md)**

## Local development

### Requirements

- Node.js 24+
- npm

### Install

```bash
npm install --ignore-scripts --no-audit --no-fund
```

### Verify the project

```bash
npm run check
```

This runs type-checking, linting and tests.

### Run the game

```bash
npm run start:playable
```

Then open **http://127.0.0.1:4176**.

## Architecture

NukeGrid keeps simulation, contracts, persistence and UI separated:

- `src/contracts/` — commands, events, units and validation;
- `src/sim/` — deterministic engine, production, economy and maintenance;
- `src/worker/` — Worker protocol;
- `src/content/` — fictional Valmorne scenario;
- `src/persistence/` — save and restore;
- `src/playable/` — HTTP server and playable session;
- `src/validation/` — validation tooling;
- `web/` — browser interface;
- `test/` — automated tests;
- `docs/` — design and architecture documentation.

## Saves

The browser stores local saves in IndexedDB.

The provided NukeGrid server keeps sessions in memory, so no database or PersistentVolume is required for a first deployment.

## Project documentation

Useful starting points:

- [Contracts](docs/L00-CONTRACT.md)
- [Engine](docs/L01-ENGINE.md)
- [Production](docs/L02-PRODUCTION.md)
- [Maintenance](docs/L03-MAINTENANCE.md)
- [Economy](docs/L04-ECONOMY.md)
- [Scenario](docs/L05-SCENARIO.md)
- [Playable UI](docs/L06-PLAYABLE-UI.md)
- [Saves](docs/L07-SAVES.md)
- [Milestone A](docs/L08-MILESTONE-A.md)

## Community roadmap

See **[ROADMAP.md](ROADMAP.md)** for starter tasks, gameplay ideas and technical limitations.

### Helm

Advanced Kubernetes users can use the optional Helm chart:

```bash
helm install nukegrid ./deploy/helm/nukegrid --namespace nukegrid --create-namespace
```

Keep the default at **1 replica** until server-side session state is shared or session affinity is deliberately configured.

### Publishing container images without CI

See **[docs/PUBLISHING.md](docs/PUBLISHING.md)** to build and push GHCR images manually, with no GitHub Actions workflow.

## Contributing

Gameplay, UX, scenarios, balancing, architecture, documentation and test improvements are welcome.

See **[CONTRIBUTING.md](CONTRIBUTING.md)**. Bug reports, feature requests and documentation requests have dedicated GitHub issue forms.

Historical Kubernetes manifests from the original private homelab are intentionally not included. Public deployment examples are generic.

## License

MIT — see [LICENSE](LICENSE).
