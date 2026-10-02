# NukeGrid

NukeGrid is an experimental deterministic nuclear-grid management game prototype.

This repository is now maintained as a public community project. The original maintainer no longer operates it as an actively developed first-party product, but forks, issues and pull requests are welcome.

## Requirements

- Node.js 24+
- npm

## Install and verify

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

## Run the playable UI

```bash
npm run start:playable
# http://127.0.0.1:4176
```

## Layout

- `src/contracts`: commands, events, units, versions and validation contracts.
- `src/sim`: deterministic PRNG, engine, production, maintenance, economy and scenarios.
- `src/worker`: Worker protocol/runtime bridge.
- `src/content`: fictitious Valmorne scenario.
- `src/persistence`: versioned local save/resume.
- `src/playable`: local HTTP server and playable session.
- `src/validation`: Milestone A validation tooling.
- `web`: browser UI.
- `docs`: design documents and architecture decisions.
- `test`: automated tests.

The imported snapshot corresponds to the former private homelab version `0.8.1-l08b`. Environment-specific Kubernetes/GitOps manifests were intentionally excluded.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT.
