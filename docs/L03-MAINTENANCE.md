# NG-L03 — Équipes, maintenance et diagnostic initial

## Scope

L03 ajoute un cycle local de maintenance déterministe au moteur L02. Il reste volontairement limité à deux équipes fictives, quatre groupes fonctionnels par tranche, des inspections et des réparations courtes.

## Décision avant engagement

`maintenanceProposal()` expose avant mutation :

- durée prévue ;
- coût total et coût de réservation engagé ;
- compétences requises ;
- manque à produire estimé à partir de la puissance courante/planifiée ;
- effet attendu ;
- inconnues liées à l'incertitude du diagnostic.

Une condition de compétence n'est jamais contournée par une dépense.

## Ressources

Valmorne fournit deux équipes complémentaires :

- équipe A : mécanique + électrique ;
- équipe B : instrumentation + électrique.

Une équipe ne peut être réservée que sur une tâche à la fois. Une tâche arrivant à son heure sans équipe passe en `blocked` avec un événement causal `MaintenanceBlocked`.

## Inspection

Une inspection :

1. réserve une équipe compétente ;
2. rend le groupe fonctionnel réellement indisponible pendant la tâche ;
3. réduit l'incertitude à 5 % ;
4. aligne l'estimation connue sur l'état réel ;
5. ne modifie ni l'état réel ni l'usure.

## Réparation

Une réparation :

1. réserve les ressources et engage le coût restant au démarrage ;
2. rend le groupe indisponible ;
3. améliore uniquement l'équipement ciblé d'un niveau ;
4. réduit partiellement l'usure sans la remettre à zéro ;
5. se termine en `awaiting-return-check`.

Le groupe reste indisponible jusqu'à `CompleteMaintenanceReturnCheck`.

## Coûts et annulation

25 % du coût estimé est engagé à la planification. Le solde est engagé au démarrage. Une annulation avant démarrage libère l'équipe mais ne rembourse pas le coût déjà engagé.

## Vieillissement

L'usure avance uniquement avec le temps simulé. Le calcul dépend de la durée, de la charge de la tranche, du nombre de cycles et de la criticité. Une observation ou un clic n'avance jamais l'usure. Le franchissement du seuil de panne rend le groupe indisponible de façon déterministe.

## Observation joueur

`PlayerObservation` expose les tâches, réservations, coûts engagés, estimations, incertitude et criticité. L'état réel caché de l'équipement n'est pas exposé directement ; l'inspection met à jour l'estimation connue.

## Hors périmètre

Pas de planning annuel, pas d'individus détaillés, pas d'arrêt complexe, pas de stock pièces détaillé, pas de physique cœur, pas d'interface graphique L06.
