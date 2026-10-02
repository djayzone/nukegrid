# Publier une image conteneur sur GHCR

[🇬🇧 English](PUBLISHING.md) · [🇫🇷 Français](PUBLISHING.fr.md)

NukeGrid n'a **aucune CI automatique sur les push ou pull requests**.

La publication d'une image passe uniquement par un workflow GitHub Actions **déclenché manuellement**, ou par votre propre machine.

## Depuis GitHub

1. Ouvrez le dépôt.
2. Allez dans **Actions**.
3. Choisissez **Publish Docker image to GHCR**.
4. Cliquez sur **Run workflow**.
5. Saisissez un tag, par exemple :
   - `latest`
   - `0.8.1-l08b`
   - `2026-10-03`
6. Lancez le workflow.

L'image publiée sera :

```text
ghcr.io/djayzone/nukegrid:<tag>
```

Le workflow utilise uniquement le `GITHUB_TOKEN` du dépôt avec `packages: write`.

> Les minutes GitHub Actions ne sont consommées que lorsque vous lancez explicitement ce workflow.

## Première publication

Après le premier push, vérifiez la visibilité du package GHCR et passez-le en **Public** pour permettre les pulls anonymes si souhaité.

## Utiliser l'image

```bash
docker pull ghcr.io/djayzone/nukegrid:latest
docker run --rm -p 4176:4176 ghcr.io/djayzone/nukegrid:latest
```

## Publication locale

```bash
docker login ghcr.io -u VOTRE_UTILISATEUR_GITHUB
docker build -t ghcr.io/djayzone/nukegrid:latest .
docker push ghcr.io/djayzone/nukegrid:latest
```
