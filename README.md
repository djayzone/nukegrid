# NukeGrid

NukeGrid is an experimental deterministic nuclear-grid management game prototype.

This directory is now part of a **public community archive**. The original first-party deployment has been retired; forks, issues and pull requests are welcome.

## Requirements

- Node.js 24+
- npm

## Install and verify

```bash
cd nukegrid
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

## Run the playable UI

```bash
npm run start:playable
# http://127.0.0.1:4176
```

The browser consumes `GET /api/state` and `POST /api/action`; simulation rules remain in the deterministic engine.

## Layout

- `src/contracts`: commands, events, units, versions and validation contracts.
- `src/sim`: deterministic PRNG, engine, production, maintenance, economy and scenarios.
- `src/worker`: Worker protocol/runtime bridge.
- `src/content`: the fictitious Valmorne scenario.
- `src/persistence`: versioned local save/resume.
- `src/playable`: local HTTP server and playable session.
- `src/validation`: Milestone A validation tooling.
- `web`: browser UI.
- `docs`: design documents and architecture decisions.
- `test`: automated tests.

## Current snapshot

The imported snapshot corresponds to the former private homelab version `0.8.1-l08b`. Environment-specific Kubernetes manifests and private infrastructure configuration were intentionally not copied into this public repository.

## Contributing

See the repository-level `CONTRIBUTING.md`. Gameplay, UX, balancing, architecture and test improvements are all in scope.
