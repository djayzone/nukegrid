# NG-L04 — Engagement commercial et comptabilité du prototype

## Scope

L04 relie la production L02, les indisponibilités/coûts L03 et un engagement commercial fictif avec une comptabilité déterministe et réconciliable.

## Programme de livraison

Le scénario Valmorne conserve un contrat explicite en MW sur une fenêtre temporelle. Le volume contractuel est toujours dérivé par intégration :

`MWh = MW × durée(h)`.

Les contrats du prototype ne peuvent pas se chevaucher. Cette contrainte empêche qu'un même MWh physique soit alloué à deux engagements.

## Prix extérieur et prévision

Le prix extérieur est une courbe déterministe du contenu. Il peut être négatif.

Le joueur observe :

- le prix courant réel ;
- une prévision future imparfaite ;
- une incertitude explicite.

La prévision est reproductible mais différente du prix futur réel. Elle ne lit pas le futur via `PlayerObservation`.

## Achat de remplacement

`BuyReplacementEnergy` référence obligatoirement un contrat. L'achat est borné par :

- la fenêtre du contrat ;
- la puissance de liquidité maximale ;
- le volume de liquidité maximal ;
- le volume contractuel ;
- le prix plafond du joueur ;
- la trésorerie lorsque le coût est positif.

Le coût est engagé immédiatement et journalisé. Un prix négatif produit un coût négatif et donc une entrée de trésorerie, sans inversion artificielle de signe.

Exemple de référence :

- 200 MW pendant 4 h = 800 MWh ;
- 800 MWh × 120 €/MWh = 96 000 € ;
- écriture comptable = -9 600 000 centimes.

## Règlement et anti-double-vente

À l'échéance, une facture est réglée une seule fois.

Réconciliation :

- production physique = physique allouée au contrat + surplus physique ;
- contrat = physique allouée + remplacement appliqué + déficit ;
- le remplacement acheté au-delà du besoin devient `unusedReplacementMwh` ;
- ce remplacement inutilisé ne crée jamais de surplus revendable.

Le revenu contractuel et l'écart sont deux écritures distinctes. Les prix d'écart peuvent être négatifs sans changer les règles de signe.

## KPIs

`PlayerObservation.economy.kpis` expose :

- trésorerie ;
- résultat d'exploitation simplifié ;
- engagements contractuels à venir ;
- exposition résiduelle aux écarts.

Chaque KPI fournit les identifiants de contrats ou d'écritures qui permettent de le reconstruire.

La trésorerie vérifie exactement :

`cash = openingCash + somme(transactions.amountCents)`.

## Effet économique de la maintenance

Pour chaque tâche L03, l'observation économique expose :

- coût déjà engagé ;
- production perdue estimée ;
- coût de remplacement estimé au prix prévisionnel ;
- référence vers la tâche source.

L'estimation ne modifie pas la simulation et n'est pas une garantie de coût futur.

## Versionnement / persistance

L04 porte :

- `CONTRACT_VERSION = 4`;
- `SCHEMA_VERSION = 3`;
- `ENGINE_VERSION = 0.4.0-l04`;
- `CONTENT_VERSION = valmorne-l04-v1`.

Le prototype n'a encore aucun déploiement NukeGrid ni sauvegarde utilisateur persistée. Les sauvegardes antérieures restent donc volontairement refusées par version plutôt que migrées silencieusement.

## Hors périmètre

Pas de carnet d'ordres, dérivés, fiscalité, multi-zone simultané, optimisation de portefeuille, backend de marché ou interface L06.
