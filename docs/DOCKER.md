# Lancer NukeGrid avec Docker

Ce guide ne suppose aucune connaissance de Node.js ou TypeScript.

## 1. Installer Docker

Installez **Docker Desktop** sur Windows/macOS ou Docker Engine sur Linux.

Vérifiez :

```bash
docker --version
docker compose version
```

## 2. Télécharger le projet

```bash
git clone https://github.com/djayzone/nukegrid.git
cd nukegrid
```

## 3. Méthode la plus simple : Docker Compose

```bash
docker compose up --build
```

Puis ouvrez :

```text
http://localhost:4176
```

Pour arrêter :

```bash
docker compose down
```

## 4. Méthode Docker classique

Construire l'image :

```bash
docker build -t nukegrid:local .
```

Lancer :

```bash
docker run --name nukegrid -p 4176:4176 nukegrid:local
```

Puis ouvrez :

```text
http://localhost:4176
```

Arrêter :

```bash
docker stop nukegrid
```

Relancer :

```bash
docker start nukegrid
```

Supprimer le conteneur :

```bash
docker rm nukegrid
```

## Vérifier que NukeGrid fonctionne

```bash
curl http://localhost:4176/healthz
```

Réponse attendue :

```json
{"ok":true}
```

## Voir les logs

Avec Compose :

```bash
docker compose logs -f nukegrid
```

Avec Docker :

```bash
docker logs -f nukegrid
```

## Changer le port

Pour utiliser le port 9000 sur votre machine :

```bash
docker run --rm -p 9000:4176 nukegrid:local
```

Puis :

```text
http://localhost:9000
```

## Où sont les sauvegardes ?

La sauvegarde principale de l'interface est stockée dans **IndexedDB dans le navigateur**.

Le conteneur n'a donc pas besoin de volume pour un premier usage.

## Mettre à jour

```bash
git pull
docker compose up --build -d
```
