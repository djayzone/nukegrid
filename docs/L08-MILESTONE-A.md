# NG-L08 — Équilibrage et validation du jalon A

## Statut du jalon

**Décision : EN ATTENTE.**

La partie automatisable du jalon A est implémentée et testée. La décision produit
`poursuivre / corriger / réduire` ne peut pas être prise tant que les **5 sessions
humaines réelles** ne sont pas exécutées et que les FPS de la vue navigateur ne
sont pas mesurés sur la machine de référence.

Aucun retour humain n'est simulé ou inventé.

## Périmètre validé automatiquement

La preuve jouable reste limitée à Valmorne fictif :

- 2 tranches ;
- 4 groupes fonctionnels par tranche ;
- 2 équipes ;
- scénario 24 h ;
- 3 engagements de livraison / prix extérieur ;
- 3 familles d'incidents ;
- maintenance courte ;
- trésorerie explicable ;
- save/reprise/export ;
- débrief causal ;
- tutoriel MW / MWh / engagement.

## Politiques de référence

1. **Prudente** : puissance réduite, couverture partielle, réparation préventive et réservation de ressource.
2. **Productive** : puissance maximale, pas de maintenance préventive et exposition assumée.
3. **Maintenance opportuniste** : inspection guidée par l'observation, réparation si le diagnostic l'indique, couverture modérée.

Les fonctions de politique reçoivent uniquement `PlayerObservation`. Elles
n'ont aucun accès au `WorldState`, aux causes cachées, au futur ou au PRNG.

## Variantes de départ

- **reference** : Valmorne L05/L07 inchangé ;
- **delivery-pressure** : engagements milieu/soir fictifs portés à 600/650 MW ;
- **maintenance-pressure** : usure initiale plus forte et diagnostic visible dégradé sur turbine V1 / alternateur V2.

Les règles de simulation et d'économie ne changent pas entre variantes.

## Matrice automatique

La CI exécute **3 politiques × 3 variantes × 30 graines = 270 sessions complètes de 24 h**.

Chaque session doit démontrer :

- état final valide ;
- cash exactement réconciliable depuis le cash d'ouverture + journal immuable ;
- zéro commande de politique rejetée ;
- zéro commande acceptée perdue ;
- débrief 24 h disponible ;
- au moins une heure sans décision ;
- groupe d'alertes sans duplication et borné à trois incidents ;
- fichier de sauvegarde final valide.

Un second test reprend chaque politique/variante à **12 h** via le snapshot L07
et exige exactement les mêmes métriques, décisions et sauvegarde finale.

## Équilibrage

L'absence de stratégie universelle est contrôlée par **dominance de Pareto** sur :

- cash final ;
- MWh produits ;
- équipements faulted ;
- commandes rejetées.

Le test échoue si une politique domine les deux autres sur **toutes** les
variantes. Il ne fabrique pas de score unique pour forcer un gagnant.

## Tutoriel

Le panneau « Tutoriel · 10 min » explique explicitement :

- **MW** = puissance instantanée ;
- **MWh** = énergie cumulée sur une durée ;
- **engagement** = puissance à livrer pendant une fenêtre, donc un volume.

La progression se débloque via les observations du moteur : engagement visible,
tranche pilotée, énergie produite et acquittement explicite de la notion.

La compréhension réelle après dix minutes reste un critère **humain**, pas un test automatisé.

## Performance

Mesure CI disponible :

- endpoint local `POST /api/action` : p95 mesuré sur 30 actions et exigé **< 150 ms**.

Mesures navigateur :

- cible vue initiale : **60 FPS — NON MESURÉ** ;
- cible vue dense : **30 FPS — NON MESURÉ**.

La CI ne transforme pas une mesure Node/HTTP en affirmation de FPS navigateur.

## Intégrité

Les garanties L07 restent actives :

- import invalide refusé avant activation ;
- copie `previous` IndexedDB ;
- aucune progression offline ;
- save/reprise sans double transaction.

## Validation humaine

Voir :

- `docs/L08-HUMAN-PROTOCOL.md`
- `docs/L08-HUMAN-RESULTS.md`

Tant que les cinq lignes P1–P5 restent **NON EXÉCUTÉ**, le jalon A n'est pas Done
et L09 ne doit pas démarrer.

## Limites connues

- les 30 graines exercent la déterminisme/persistance mais le scénario L05 utilise
  encore plusieurs rolls d'incidents fixés par contenu ; la diversité inter-graine
  reste donc limitée ;
- aucun test statistique n'est revendiqué ;
- pas de cloud, compte ou multi-device ;
- pas d'expansion géographique avant décision du jalon A.
