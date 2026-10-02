# NG-L08b — UX, direction artistique et francisation

## Décision produit

Le test utilisateur du 20 septembre 2026 classe le Jalon A en **CORRIGER**.

Problèmes observés :
- à partir de J2 la simulation peut continuer sans rendre claire la prochaine décision ;
- les objectifs et priorités ne sont pas assez visibles ;
- des termes techniques issus des enums apparaissent en anglais dans l'interface ;
- la vue réelle de la centrale est visuellement en retrait par rapport aux assets de la direction artistique validée.

## Choix

Option A : **le produit réel doit rejoindre les assets**, pas l'inverse.

## Implémentation L08b

- panneau prioritaire Objectif actuel avant les panneaux secondaires ;
- affichage de l'échéance, du risque et de la prochaine action ;
- utilisation directe de PlayerObservation.scenario.objectives ;
- état explicite Période calme avec prochain point de vigilance quand aucune décision n'est urgente ;
- traduction des familles d'incident, statuts, tâches et groupes fonctionnels visibles ;
- retrait des codes techniques de feedback de la surface principale ;
- remplacement de la vue blocs par une composition centrale cohérente avec la DA bronze/ambre/or/crème ;
- UI versionnée 0.8.1-l08b, moteur et schéma de sauvegarde inchangés.

## Validation requise

Les tests automatisés vérifient les garde-fous structurels mais **ne valident pas l'expérience humaine**.
Avant clôture du Jalon A :
1. rejouer une session complète, notamment J2 et au-delà ;
2. vérifier qu'un testeur peut dire quoi faire et pourquoi sans explication externe ;
3. comparer visuellement les assets validés et le rendu réel ;
4. exécuter les tests humains prévus par NG-L08.
