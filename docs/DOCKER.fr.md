# Lancer NukeGrid avec Docker

[🇬🇧 English](DOCKER.md) · [🇫🇷 Français](DOCKER.fr.md)

Ce guide ne suppose aucune connaissance de Node.js ou TypeScript.

## 1. Installer Docker

Installez **Docker Desktop** sur Windows/macOS ou Docker Engine sur Linux.

```bash
docker --version
docker compose version
```

## 2. Télécharger le projet

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
```

## 3. Docker Compose

```bash
docker compose up --build
```

Puis ouvrez **http://localhost:4176**.

Pour arrêter :

```bash
docker compose down
```

## 4. Docker classique

```bash
docker build -t nukegrid:local .
docker run --name nukegrid -p 4176:4176 nukegrid:local
```

## Vérifier le service

```bash
curl http://localhost:4176/healthz
```

Réponse attendue :

```json
{"ok":true}
```

## Logs

```bash
docker compose logs -f nukegrid
```

## Changer le port

```bash
docker run --rm -p 9000:4176 nukegrid:local
```

Puis ouvrez **http://localhost:9000**.

## Sauvegardes

La sauvegarde principale est stockée dans IndexedDB côté navigateur.

## Mettre à jour

```bash
git pull
docker compose up --build -d
```
