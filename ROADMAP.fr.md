# Roadmap communautaire

[🇬🇧 English](ROADMAP.md) · [🇫🇷 Français](ROADMAP.fr.md)

NukeGrid est maintenu par la communauté. Cette roadmap liste des pistes utiles sans engagement de livraison.

## Premières contributions

- Ajouter de vraies captures d'écran ou un GIF de gameplay au README.
- Améliorer l'onboarding et le dépannage.
- Améliorer l'accessibilité et le responsive.
- Ajouter de petits scénarios ou événements isolés avec tests.
- Harmoniser les textes français/anglais de l'UI et de la documentation.

## Gameplay & UX

- Clarifier les objectifs, conséquences et feedbacks.
- Améliorer l'expérience J-2 et la progression du temps.
- Ajouter davantage de scénarios et de décisions sous contrainte.
- Harmoniser les assets et l'interface web.
- Ajouter un meilleur tutoriel de première utilisation.

## Technique

- Isoler le stockage des sessions derrière une interface.
- Ajouter éventuellement un backend partagé avant tout scaling horizontal.
- Améliorer l'import/export des sauvegardes.
- Ajouter des scénarios de régression déterministes.

## Déploiement

Un chart Helm optionnel est disponible dans `deploy/helm/nukegrid`. La valeur par défaut reste **1 replica** car les sessions serveur sont actuellement en mémoire.

## Non-objectifs

- Réintroduire la configuration du homelab privé.
- Imposer un fournisseur cloud.
- Ajouter une CI GitHub Actions automatique consommant des minutes.
- Héberger une démo live officielle.

## Participer

Cherchez les issues `good first issue` et `help wanted`, ou ouvrez une feature request.
