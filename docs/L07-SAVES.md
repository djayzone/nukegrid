# NG-L07 — Sauvegardes fiables et reprise

## Résultat

L07 rend la session locale reprenable exactement : aucune progression hors ligne, aucune recomposition économique au chargement et aucune seconde transaction après reload.

La persistance sérialise l'état ; elle ne contient aucune règle métier.

## Schéma v5

Chaque fichier contient :

- `schemaVersion`, `engineVersion`, `contentVersion` ;
- temps simulé et `WorldState` complet ;
- état PRNG ;
- file des événements futurs ;
- commandes acceptées mais encore en attente ;
- événements déjà exécutés nécessaires à l'observation/débrief ;
- journal moteur ;
- politiques, transactions et IDs d'idempotence recopiés et vérifiés contre le monde ;
- séquence d'IDs du contrôleur jouable ;
- checksum FNV-1a versionné.

Les redondances critiques (`transactions`, `policies`, files, IDs) sont vérifiées avant activation afin de détecter une sauvegarde incohérente.

## Compatibilité et migration

L07 accepte uniquement :

- schema **5** ;
- engine **0.7.0-l07** ;
- content **valmorne-l05-v1** ;
- PRNG **xorshift32-v1**.

Un fichier L06/schema 4 est une **fixture ancienne incompatible** et est refusé par `SAVE_SCHEMA_VERSION_UNSUPPORTED` / `SAVE_ENGINE_VERSION_UNSUPPORTED`. Il n'existe donc aucune migration implicite ou replay inter-version. Une future migration devra être une fonction explicite, testée de vN vers vN+1 avant que la matrice de compatibilité soit élargie.

## Reprise transactionnelle

`PlayableSession.restoreSave` :

1. parse/valide entièrement le candidat ;
2. vérifie checksum, versions, monde et redondances ;
3. construit un nouveau moteur en mémoire ;
4. remplace la partie active seulement si la construction réussit.

Un import corrompu/incompatible laisse donc la session active inchangée.

`DeterministicEngine.restore` restaure PRNG, commandes en attente, événements futurs, événements exécutés et journal. Les `processedCommandIds` conservés dans le monde empêchent une commande déjà appliquée de recréer une transaction après reload.

## IndexedDB

Le navigateur utilise `nukegrid-local/saves` :

- slot `current` ;
- slot `previous`, contenant la copie remplacée ;
- autosave différé de **350 ms** après une action pour ne pas bloquer le rendu ;
- sauvegarde manuelle ;
- export JSON ;
- import JSON validé côté moteur avant activation ;
- `QuotaExceededError` et erreurs IndexedDB annoncées via une région `aria-live`.

À la réouverture, `current` est proposé au serveur local via `POST /api/load`. Le temps simulé reprend exactement à `payload.simTimeSec`. Le temps mural n'est jamais lu pour faire progresser la simulation.

Passage de la page en arrière-plan : sauvegarde de suspension best-effort ; aucune avance de simulation.

## Endpoints locaux

- `GET /api/save` → fichier + métriques ;
- `POST /api/load` → validation et activation atomique ;
- les endpoints L06 `/api/state` et `/api/action` restent inchangés.

## Fixtures / preuves

Les tests L07 produisent trois familles de fixtures exécutables :

- valide : `PlayableSession.exportSave()` ;
- corrompue : checksum remplacé ;
- ancienne : schema 4 + engine L06 avec checksum recalculé.

Acceptations automatiques :

1. reprise au milieu d'une maintenance identique à l'exécution continue ;
2. import corrompu refusé sans écrasement ;
3. ancienne version explicitement refusée ;
4. commandes futures, file événements et journal conservés ;
5. achat déjà exécuté non rejoué après reload ;
6. aucune progression hors ligne ;
7. taille snapshot mesurée ;
8. IndexedDB current/previous, autosave différé, quota annoncé ;
9. contrôles manuels save/export/import présents ;
10. payload exact-resume complet.

La CI imprime la taille réelle de la fixture de référence ; le test impose aussi un plafond de 500 kB pour détecter une dérive grossière.

## Limites

Toujours hors périmètre : cloud, compte, synchronisation multi-device, chiffrement applicatif, migration automatique inter-version. IndexedDB reste une persistance locale navigateur.

## Commandes

```bash
npm run check
npm run start:playable
```

## Prochain lot

Ne démarrer L08 qu'après succès Dagger sur l'exact HEAD L07, merge et passage Plane à Done.
