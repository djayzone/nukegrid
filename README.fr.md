<div align="center">

# NukeGrid

### Un jeu de gestion de réseau électrique et de production nucléaire déterministe.

**Pilotez la production, la maintenance, les incidents et l'économie d'un réseau sous contrainte.**

[🇬🇧 English](README.md) · [🇫🇷 Français](README.fr.md)

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-24%2B-339933)
![TypeScript](https://img.shields.io/badge/typescript-ready-3178C6)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)
![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326CE5)
![Status](https://img.shields.io/badge/status-community--maintained-purple)

</div>

---

## À propos

**NukeGrid** est un prototype de jeu de gestion déterministe autour de la production électrique, de la maintenance, des incidents, des engagements de livraison et de l'économie d'un réseau.

Le projet n'est plus développé comme produit officiel par son créateur, mais il reste **ouvert aux forks, issues et pull requests**.

> Vous débutez ? Utilisez Docker Compose : c'est la façon la plus simple de lancer le jeu sans installer Node.js.

## Démarrage rapide

| Méthode | Pour qui ? | Commande principale |
|---|---|---|
| **Docker Compose** | Débutants | `docker compose up --build` |
| **Docker** | Utilisateurs Docker | `docker build -t nukegrid:local .` |
| **Node.js local** | Développeurs | `npm run start:playable` |
| **Kubernetes** | Homelab / cluster | voir [docs/KUBERNETES.fr.md](docs/KUBERNETES.fr.md) |

### Option recommandée : Docker Compose

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
docker compose up --build
```

Puis ouvrez **http://localhost:4176**.

## Docker

Guide détaillé : **[docs/DOCKER.fr.md](docs/DOCKER.fr.md)**

## Kubernetes

Guide détaillé : **[docs/KUBERNETES.fr.md](docs/KUBERNETES.fr.md)**

## Développement local

### Prérequis

- Node.js 24+
- npm

### Installation

```bash
npm install --ignore-scripts --no-audit --no-fund
```

### Vérifier le projet

```bash
npm run check
```

### Lancer le jeu

```bash
npm run start:playable
```

Puis ouvrez **http://127.0.0.1:4176**.

## Architecture

- `src/contracts/` — commandes, événements, unités et validation ;
- `src/sim/` — moteur déterministe, production, économie et maintenance ;
- `src/worker/` — protocole Worker ;
- `src/content/` — scénario fictif de Valmorne ;
- `src/persistence/` — sauvegarde et restauration ;
- `src/playable/` — serveur HTTP et session jouable ;
- `src/validation/` — outils de validation ;
- `web/` — interface navigateur ;
- `test/` — tests automatisés ;
- `docs/` — documentation de conception.

## Sauvegardes

Le navigateur utilise IndexedDB pour la sauvegarde locale côté client. Le serveur conserve les sessions en mémoire.

## Contribuer

Voir **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Licence

MIT — voir [LICENSE](LICENSE).
