# NG-L06 — Interface jouable et première direction artistique

## Résultat

L06 ajoute une interface locale jouable sans console développeur. Le navigateur ne contient aucune règle de simulation : il lit `PlayerObservation` et envoie des intentions au contrôleur `PlayableSession`, qui les traduit en commandes versionnées pour `DeterministicEngine`.

Le prototype reste volontairement source-only : aucun Ingress, Deployment ou compte utilisateur n'est introduit.

## Lancer la démo

```bash
cd apps/ovh-primary/nukegrid
npm install --ignore-scripts --no-audit --no-fund
npm run start:playable
# ouvrir http://127.0.0.1:4176
```

## Coque

- haut : objectifs opérationnels, trésorerie, production, exposition, marché ;
- gauche : actifs observables ;
- centre : site 2,5D SVG léger ;
- droite : inspecteur tranche et intentions de production/maintenance ;
- bas : horloge et avance explicite du temps ;
- vues secondaires : alertes groupées, prévisions, engagements, planning, débrief.

La simulation est en pause par défaut et ne progresse qu'après une intention explicite.

## Direction artistique

Palette : graphite, blanc chaud, bleu sélection, ambre attention, rouge urgence réelle. Les états ne reposent jamais uniquement sur la couleur : labels, badges et vue tabulaire équivalente restent disponibles.

Les flux graphiques n'apparaissent actifs que si la puissance réellement observée est positive et que la tranche est en production/limitation. Les mouvements sont neutralisés avec `prefers-reduced-motion`.

Le jour/nuit suit l'heure simulée. La météo n'étant pas encore un état du moteur, l'interface affiche explicitement **météo non modélisée** au lieu de fabriquer une donnée.

## Accessibilité

- navigation clavier native des boutons ;
- raccourcis `1` / `2` pour les tranches et `Alt+→` pour +15 min ;
- focus visible ;
- skip-link ;
- régions `aria-live` pour action et alarmes ;
- vue tabulaire équivalente au schéma ;
- texte redimensionnable ;
- reduced motion ;
- son désactivé par défaut et jamais canal unique ;
- acquittement visuel local des alertes ;
- layout ciblé 1366×768 et 1920×1080, mobile complet différé.

## Économie et confirmation

`PlayerObservation.economy.commitments` expose uniquement les données commerciales connaissables : fenêtre, puissance/énergie engagée, prix contractuel, règlement, génération physique connue, couverture déjà achetée et exposition restante.

Tout achat d'énergie de remplacement depuis l'UI passe d'abord par `confirmation-required`. Aucun centime ne bouge avant la seconde intention `confirmed: true`. Le moteur conserve ensuite les contrôles prix, liquidité, fenêtre et trésorerie.

## Versions

- contract : 6 ;
- schema/save : 4 inchangé, aucune migration de sauvegarde ;
- engine : `0.6.0-l06` ;
- UI : `0.6.0-l06` ;
- content : `valmorne-l05-v1` inchangé ;
- PRNG : `xorshift32-v1` inchangé.

## Preuves automatiques

`test/l06.test.ts` couvre :

1. versions L06 ;
2. engagements commerciaux dans PlayerObservation sans fuite de condition réelle ;
3. validation des intentions navigateur ;
4. feedback accepté/refusé pour chaque action ;
5. démarrage + consigne + production par intentions UI ;
6. confirmation obligatoire avant achat coûteux ;
7. alertes groupées L05 visibles ;
8. débrief 24h avec plusieurs conséquences précises ;
9. contrats statiques clavier/reduced-motion/focus/table/layout ;
10. client limité aux endpoints state/action.

## Passation visuelle

Les états à contrôler lors d'une revue humaine sont : initial 1366×768, alerte vibration+relève à 06:05, confirmation achat, tâche maintenance assignée, et débrief 24h.

La CI valide les contrats structurels et fonctionnels ; elle **ne constitue pas une validation visuelle humaine**. Les défauts visuels restants doivent donc être consignés après cette revue : densité de l'inspecteur à 1366px, lisibilité des prévisions avec valeurs extrêmes et qualité des libellés longs.

## Limites / prochain lot

Pas de carte réelle, 3D, compte, persistance navigateur, backend distant, audio spatial ni moteur météo. L06 ne modifie pas la physique et ne doit pas être utilisé comme source de vérité hors `PlayerObservation`.
