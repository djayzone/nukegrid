# Lancer NukeGrid sur Kubernetes

[🇬🇧 English](KUBERNETES.md) · [🇫🇷 Français](KUBERNETES.fr.md)

Ce guide permet de lancer NukeGrid sans connaître Kubernetes en détail.

## Ce qui sera créé

Le manifeste crée :

- un namespace `nukegrid` ;
- un Deployment ;
- un Service interne.

NukeGrid n'a besoin ni de base de données ni de PersistentVolume pour un premier démarrage.

## Test local avec kind

```bash
docker build -t nukegrid:local .
kind create cluster --name nukegrid
kind load docker-image nukegrid:local --name nukegrid
kubectl apply -f deploy/kubernetes/
kubectl -n nukegrid get pods
kubectl -n nukegrid port-forward svc/nukegrid 4176:4176
```

Puis ouvrez **http://localhost:4176**.

## Vrai cluster Kubernetes

```bash
docker build -t REGISTRY/UTILISATEUR/nukegrid:latest .
docker push REGISTRY/UTILISATEUR/nukegrid:latest
```

Remplacez ensuite `image: nukegrid:local` dans le manifeste par votre image et appliquez :

```bash
kubectl apply -f deploy/kubernetes/
```

## Logs

```bash
kubectl -n nukegrid logs -f deployment/nukegrid
```

## Redémarrer

```bash
kubectl -n nukegrid rollout restart deployment/nukegrid
```

## Plusieurs replicas ?

Le serveur conserve les sessions en mémoire. Pour un premier déploiement, gardez **1 replica**.

## Exposition publique

Pour commencer, utilisez le port-forward. Pour Internet, ajoutez ensuite un Ingress adapté à votre cluster avec HTTPS.
