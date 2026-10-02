<div align="center">

# NukeGrid

### Un jeu de gestion de réseau électrique et de production nucléaire déterministe.

**Pilotez la production, la maintenance, les incidents et l'économie d'un réseau sous contrainte.**

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
| **Kubernetes** | Homelab / cluster | voir [docs/KUBERNETES.md](docs/KUBERNETES.md) |

### Option recommandée : Docker Compose

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
docker compose up --build
```

Puis ouvrez :

**http://localhost:4176**

## Docker

Guide détaillé pour débutants :

**[docs/DOCKER.md](docs/DOCKER.md)**

Version courte :

```bash
docker build -t nukegrid:local .
docker run --rm -p 4176:4176 nukegrid:local
```

## Kubernetes

Un manifeste générique prêt à utiliser est fourni dans `deploy/kubernetes/`.

Test local rapide avec **kind** :

```bash
docker build -t nukegrid:local .
kind create cluster --name nukegrid
kind load docker-image nukegrid:local --name nukegrid
kubectl apply -f deploy/kubernetes/
kubectl -n nukegrid port-forward svc/nukegrid 4176:4176
```

Puis ouvrez **http://localhost:4176**.

Guide complet :

**[docs/KUBERNETES.md](docs/KUBERNETES.md)**

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

Cette commande exécute le typecheck, le lint et les tests.

### Lancer le jeu

```bash
npm run start:playable
```

Puis ouvrez :

**http://127.0.0.1:4176**

## Architecture

NukeGrid sépare clairement simulation, contrats, persistance et interface :

- `src/contracts/` — commandes, événements, unités et validation ;
- `src/sim/` — moteur déterministe, production, économie et maintenance ;
- `src/worker/` — protocole Worker ;
- `src/content/` — scénario fictif de Valmorne ;
- `src/persistence/` — sauvegarde et restauration ;
- `src/playable/` — serveur HTTP et session jouable ;
- `src/validation/` — outils de validation ;
- `web/` — interface navigateur ;
- `test/` — tests automatisés ;
- `docs/` — décisions et documentation de conception.

## Sauvegardes

Le navigateur utilise IndexedDB pour la sauvegarde locale côté client.

Le serveur NukeGrid fourni ici conserve les sessions en mémoire et n'exige donc pas de base de données ou de PersistentVolume pour démarrer.

## Documentation du projet

Quelques points d'entrée :

- [Contrats](docs/L00-CONTRACT.md)
- [Moteur](docs/L01-ENGINE.md)
- [Production](docs/L02-PRODUCTION.md)
- [Maintenance](docs/L03-MAINTENANCE.md)
- [Économie](docs/L04-ECONOMY.md)
- [Scénario](docs/L05-SCENARIO.md)
- [Interface jouable](docs/L06-PLAYABLE-UI.md)
- [Sauvegardes](docs/L07-SAVES.md)
- [Milestone A](docs/L08-MILESTONE-A.md)

## Contribuer

Les améliorations de gameplay, UX, scénarios, équilibrage, architecture, documentation et tests sont les bienvenues.

Voir **[CONTRIBUTING.md](CONTRIBUTING.md)**.

Les manifests Kubernetes historiques du homelab privé ne font volontairement pas partie de ce dépôt. Les exemples publics fournis ici sont génériques.

## Licence

MIT — voir [LICENSE](LICENSE).
