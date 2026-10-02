# Community roadmap

[🇬🇧 English](ROADMAP.md) · [🇫🇷 Français](ROADMAP.fr.md)

NukeGrid is community-maintained. This roadmap lists useful directions; it is not a delivery commitment.

## Good first contributions

- Add real screenshots or a short gameplay GIF to the README.
- Improve onboarding and troubleshooting documentation.
- Improve accessibility and responsive behavior.
- Add small, isolated scenarios or events with tests.
- Improve French/English wording consistency in the UI and docs.

## Gameplay & UX

- Clarify objectives, consequences and player feedback.
- Improve the J-2 / time-progression experience.
- Expand scenario variety and decision pressure.
- Improve visual consistency between game assets and the web UI.
- Add a clearer tutorial / first-run flow.

## Technical improvements

- Extract server-side session storage behind an interface.
- Add an optional shared session backend before horizontal scaling.
- Improve save/import/export UX.
- Add more deterministic regression scenarios.
- Keep Docker and Kubernetes deployment paths straightforward.

## Deployment

Docker Compose and generic Kubernetes manifests are provided.

An optional Helm chart is available under `deploy/helm/nukegrid`. The default replica count is intentionally **1** because server sessions are currently held in memory.

## Non-goals

- Reintroducing private homelab configuration.
- Requiring a specific cloud provider.
- Running CI automatically on pushes or pull requests. The only GitHub Actions workflow is an explicit manual container-image publication.
- Hosting an official live demo.

## How to help

Look for `good first issue` and `help wanted` issues, or open a feature request before starting a large change.
