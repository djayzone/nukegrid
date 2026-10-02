# Publish a container image to GHCR

[🇬🇧 English](PUBLISHING.md) · [🇫🇷 Français](PUBLISHING.fr.md)

NukeGrid has **no automatic CI on push or pull requests**.

Container publishing is available only through a **manually triggered GitHub Actions workflow** or from your own machine.

## Recommended: GitHub UI

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Publish Docker image to GHCR**.
4. Click **Run workflow**.
5. Enter the image tag, for example:
   - `latest`
   - `0.8.1-l08b`
   - `2026-10-03`
6. Confirm **Run workflow**.

The workflow publishes:

```text
ghcr.io/djayzone/nukegrid:<tag>
```

It uses the repository `GITHUB_TOKEN` with `packages: write`; no personal access token is stored.

> GitHub-hosted runner minutes are consumed only when this workflow is manually launched.

## First package publication

GHCR package visibility is separate from repository visibility. After the first push, set the package to **Public** if anonymous pulls are desired.

## Pull and run

```bash
docker pull ghcr.io/djayzone/nukegrid:latest
docker run --rm -p 4176:4176 ghcr.io/djayzone/nukegrid:latest
```

## Manual publishing from your own machine

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
docker build -t ghcr.io/djayzone/nukegrid:latest .
docker push ghcr.io/djayzone/nukegrid:latest
```
