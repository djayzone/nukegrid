# Run NukeGrid on Kubernetes

[🇬🇧 English](KUBERNETES.md) · [🇫🇷 Français](KUBERNETES.fr.md)

This guide is intended for people who are new to Kubernetes.

## What gets created

The manifest in `deploy/kubernetes/deployment.yaml` creates:

- namespace `nukegrid`;
- one Deployment;
- one internal Service.

NukeGrid does not require a database or PersistentVolume for a basic deployment.

## Option A — local test with kind

Install Docker, `kubectl` and `kind`.

```bash
docker build -t nukegrid:local .
kind create cluster --name nukegrid
kind load docker-image nukegrid:local --name nukegrid
kubectl apply -f deploy/kubernetes/
kubectl -n nukegrid get pods
kubectl -n nukegrid port-forward svc/nukegrid 4176:4176
```

Then open **http://localhost:4176**.

## Option B — real Kubernetes cluster

Build and push the image:

```bash
docker build -t REGISTRY/USER/nukegrid:latest .
docker push REGISTRY/USER/nukegrid:latest
```

In `deploy/kubernetes/deployment.yaml`, replace:

```yaml
image: nukegrid:local
```

with your image:

```yaml
image: REGISTRY/USER/nukegrid:latest
```

Then deploy:

```bash
kubectl apply -f deploy/kubernetes/
```

## Logs

```bash
kubectl -n nukegrid logs -f deployment/nukegrid
```

## Restart

```bash
kubectl -n nukegrid rollout restart deployment/nukegrid
```

## Remove

```bash
kubectl delete -f deploy/kubernetes/
```

## Scaling

The server keeps sessions in memory. Keep **1 replica** for a basic deployment.

Before scaling horizontally, add shared session state or a suitable session-affinity strategy.

## Public exposure

Start with port-forwarding. For Internet exposure, add an Ingress compatible with your cluster and enable HTTPS.
