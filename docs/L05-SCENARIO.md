# NG-L05 — Scénario, incidents et explication causale

## Session de référence

**Relève sous tension à Valmorne** dure 24 h simulées et constitue la première session NukeGrid rejouable.

Le briefing donne trois objectifs : tenir les engagements, traiter les signaux techniques avec les bonnes ressources et garder les coûts explicables.

Trois horizons restent visibles dans `PlayerObservation` :

- maintenant ;
- 24–72 h ;
- mois/années.

## Chaîne causale

Chaque incident suit obligatoirement :

`précondition → cause cachée → signal observable → décision possible → conséquence/évitement → révélation → apprentissage`.

La cause cachée reste exclusivement dans `WorldState` jusqu'à `revealCauseAtSec`. Elle n'est jamais projetée dans `PlayerObservation` avant cette frontière.

## Familles initiales

### Mécanique

Une usure fictive de turbine produit d'abord un signal de vibration. Si le joueur répare réellement avant la conséquence, la limitation est évitée. Sinon, la capacité est temporairement réduite.

La limitation référence directement le contrat `delivery-valmorne-midday`, ce qui permet au débrief de remonter des MWh et écritures financières vers l'incident.

### Équipe / pièce

Une relève instrumentation risque d'être retardée. Une équipe B déjà réservée sur une tâche pertinente n'est pas retirée par le script. Sans réservation, l'équipe devient temporairement indisponible.

### Programme / prix

Une révision annonce une zone de prix élevée avant l'engagement du soir. Une couverture complète achetée avant le pic marque l'incident comme évité. Le directeur ne remplace jamais cette réussite par une autre panne punitive.

## Alertes

Les signaux distants de 15 minutes simulées ou moins sont regroupés dans un même lot d'alertes. Le regroupement n'altère aucun état industriel ; c'est une projection narrative.

## Reproductibilité

Les variantes initiales portent des `deterministicRoll` de contenu. Elles ne dépendent ni des FPS, ni des clics, ni de la taille des pas d'avance. Une même durée simulée et le même état initial donnent les mêmes incidents.

## Débrief

À 24 h, `PlayerObservation.scenario.debrief` superpose :

- signaux ;
- commandes exécutées ;
- conséquences/évitements ;
- révélations causales ;
- écritures financières.

Chaque carte conserve ce qui était connaissable au moment de la décision et les références économiques reliées.

## Boucle pédagogique 25–45 min

Le scénario est conçu pour la séquence suivante côté future UI :

briefing → prévision imparfaite → plan → signaux → maintenance/couverture → écarts significatifs → débrief.

Les repères 0–30 minutes sont des objectifs d'expérience utilisateur et ne modifient pas l'horloge simulée.

## Hors périmètre

Pas de LLM obligatoire, pas de catastrophes Europe, pas de génération procédurale de dizaines de familles, pas d'interface graphique L06.
