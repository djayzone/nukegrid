# Lancer NukeGrid sur Kubernetes

Ce guide permet de lancer NukeGrid sans connaître en détail Kubernetes.

## Ce qui sera créé

Le manifeste `deploy/kubernetes/deployment.yaml` crée :

- un namespace `nukegrid` ;
- un Deployment ;
- un Service interne.

NukeGrid n'a pas besoin de base de données ni de PersistentVolume pour un premier démarrage.

## Option A — test local avec kind

### 1. Prérequis

Installez :

- Docker ;
- `kubectl` ;
- `kind`.

Vérifiez :

```bash
docker --version
kubectl version --client
kind version
```

### 2. Construire l'image

```bash
docker build -t nukegrid:local .
```

### 3. Créer un cluster

```bash
kind create cluster --name nukegrid
```

### 4. Charger l'image dans kind

```bash
kind load docker-image nukegrid:local --name nukegrid
```

### 5. Déployer

```bash
kubectl apply -f deploy/kubernetes/
```

### 6. Vérifier

```bash
kubectl -n nukegrid get pods
kubectl -n nukegrid get svc
```

Le pod doit finir en état `Running`.

### 7. Accéder au jeu

```bash
kubectl -n nukegrid port-forward svc/nukegrid 4176:4176
```

Puis ouvrez :

```text
http://localhost:4176
```

## Option B — vrai cluster Kubernetes

Construisez et poussez l'image dans votre registre :

```bash
docker build -t REGISTRY/UTILISATEUR/nukegrid:latest .
docker push REGISTRY/UTILISATEUR/nukegrid:latest
```

Dans `deploy/kubernetes/deployment.yaml`, remplacez :

```yaml
image: nukegrid:local
```

par :

```yaml
image: REGISTRY/UTILISATEUR/nukegrid:latest
```

Puis appliquez :

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

## Supprimer

```bash
kubectl delete -f deploy/kubernetes/
```

## Plusieurs replicas ?

Le serveur conserve des sessions en mémoire. Pour un premier déploiement, gardez **1 replica**.

Avant de scaler horizontalement, il faut prévoir une stratégie de session partagée ou d'affinité de session selon l'usage souhaité.

## Exposer publiquement

Pour commencer, utilisez le port-forward.

Pour Internet, ajoutez ensuite un Ingress adapté à votre cluster, avec HTTPS. Les contrôleurs Ingress variant selon les plateformes, aucun Ingress spécifique n'est imposé dans le dépôt public.
