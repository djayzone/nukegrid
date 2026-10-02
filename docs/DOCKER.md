# Run NukeGrid with Docker

[🇬🇧 English](DOCKER.md) · [🇫🇷 Français](DOCKER.fr.md)

This guide assumes no Node.js or TypeScript knowledge.

## 1. Install Docker

Install **Docker Desktop** on Windows/macOS or Docker Engine on Linux.

```bash
docker --version
docker compose version
```

## 2. Download the project

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
```

## 3. Easiest method: Docker Compose

```bash
docker compose up --build
```

Open **http://localhost:4176**.

Stop:

```bash
docker compose down
```

## 4. Plain Docker

```bash
docker build -t nukegrid:local .
docker run --name nukegrid -p 4176:4176 nukegrid:local
```

Open **http://localhost:4176**.

## Health check

```bash
curl http://localhost:4176/healthz
```

Expected response:

```json
{"ok":true}
```

## Logs

Compose:

```bash
docker compose logs -f nukegrid
```

Docker:

```bash
docker logs -f nukegrid
```

## Use another host port

```bash
docker run --rm -p 9000:4176 nukegrid:local
```

Open **http://localhost:9000**.

## Where are saves stored?

The main browser save is stored in **IndexedDB**. The container does not need a volume for a basic deployment.

## Update

```bash
git pull
docker compose up --build -d
```
