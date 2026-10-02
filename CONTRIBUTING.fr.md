# Contribuer

[🇬🇧 English](CONTRIBUTING.md) · [🇫🇷 Français](CONTRIBUTING.fr.md)

Les contributions sont les bienvenues.

## Avant de commencer

Pour une évolution gameplay ou architecture importante, ouvrez d'abord une feature request.

Labels utiles :

- `good first issue` ;
- `help wanted` ;
- `documentation`.

## Workflow de contribution

1. Forkez le dépôt.
2. Créez une branche dédiée.
3. Faites votre modification.
4. Lancez les validations localement.
5. Ouvrez une pull request avec les vérifications réalisées.

## Vérifications locales

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

Si Docker est concerné :

```bash
docker build -t nukegrid:local .
docker run --rm -p 4176:4176 nukegrid:local
curl http://localhost:4176/healthz
```

## Politique GitHub Actions

Le dépôt n'exécute volontairement **aucune CI automatique sur les push ou pull requests**.

Le seul workflow GitHub Actions est :

```text
Publish Docker image to GHCR
```

Il est lancé uniquement manuellement via `workflow_dispatch`.

Son rôle est la publication d'une image, pas la validation des pull requests.

Lancement :

```text
GitHub → Actions → Publish Docker image to GHCR → Run workflow
```

Voir [docs/PUBLISHING.fr.md](docs/PUBLISHING.fr.md).

## Note spécifique NukeGrid

Le serveur conserve actuellement les sessions en mémoire.

Gardez les déploiements Kubernetes/Helm à **1 replica** sauf si votre contribution ajoute volontairement un stockage partagé des sessions ou une stratégie d'affinité adaptée.

## Sécurité

Ne versionnez jamais d'identifiants, endpoints privés, DNS internes, secrets ou manifests privés du homelab.

## Pull requests

Gardez les changements ciblés et précisez :

- ce qui change ;
- pourquoi ;
- l'impact gameplay/UX si pertinent ;
- comment le changement a été testé ;
- les limitations connues.

Les captures sont recommandées pour les changements UI.
