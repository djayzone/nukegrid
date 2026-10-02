# Publication manuelle d'une image conteneur (GHCR)

NukeGrid ne fournit volontairement **aucun workflow GitHub Actions automatique** de publication.

Cela évite toute consommation automatique de minutes CI.

## Publier manuellement

```bash
docker login ghcr.io -u VOTRE_UTILISATEUR_GITHUB
docker build -t ghcr.io/djayzone/nukegrid:latest .
docker push ghcr.io/djayzone/nukegrid:latest
```

Pour une version :

```bash
docker build -t ghcr.io/djayzone/nukegrid:0.8.1-l08b .
docker push ghcr.io/djayzone/nukegrid:0.8.1-l08b
```

Après le premier push, passez le package en visibilité **Public** dans GitHub Packages si vous souhaitez autoriser les pulls anonymes.

## Utiliser l'image

```bash
docker run --rm -p 4176:4176 ghcr.io/djayzone/nukegrid:latest
```

Pour Kubernetes ou Helm, utilisez `ghcr.io/djayzone/nukegrid` comme repository d'image.
