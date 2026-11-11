# Parler à 5 cibles avant d'écrire plus de code

**Objectif** : savoir si quelqu'un paierait, pas si l'idée plaît. Règle : on pose des questions sur *leur passé*, jamais « est-ce que vous aimeriez ? ».
**Durée** : 25 min. **Démo** : 3 min maximum, à la fin seulement (`bench/pages` + extension en mode FALC, ou `./start.sh` puis `?mode=doc`).

## Cibles (1 ou 2 conversations par ligne, 5 au total)

| # | Cible | Pourquoi elle | Où la trouver |
|---|---|---|---|
| 1 | Agence / freelance accessibilité (RGAA/WCAG) | vend déjà des audits, sait ce que coûte une correction | LinkedIn « RGAA », communautés a11y, meetups |
| 2 | Service numérique d'une mairie ou intercommunalité | obligation légale RGAA, contenus administratifs longs, public fragile | DINUM/ANCT, réseaux de DSI territoriaux |
| 3 | Association (dyslexie, handicap cognitif, FALC) | utilisateurs finaux ; valident la lisibilité | APEDYS, Unapei, associations locales |
| 4 | E-commerçant (Shopify/Prestashop, 1-20 personnes) | Directive européenne sur l'accessibilité (en vigueur depuis le 28 juin 2025) ; à vérifier avec un juriste | communautés e-commerce |
| 5 | Éditeur de contenu / presse locale OU équipe « agents IA » d'une marque | veut être *lisible par les agents* (`llms.txt`, Markdown) | communautés SEO/GEO, meetups IA |

## Script (à lire tel quel)

1. « Racontez-moi la dernière fois où une page de votre site/service a posé problème à quelqu'un d'handicapé / à un agent / à un client. » (laisser parler)
2. « Qu'avez-vous fait ? Combien de temps / d'argent ? Qui l'a fait ? »
3. « Qu'avez-vous déjà essayé (plugins overlay, audit, refonte) ? Pourquoi ça n'a pas suffi ? »
4. « Si ce problème disparaissait, qui s'en apercevrait dans votre organisation ? »
5. « Comment décide-t-on d'acheter ce genre de chose ici ? Qui signe ? Quel budget ? »
6. *(démo, 3 min)* « Voici votre page / une page type en mode adapté. Qu'est-ce qui vous gêne ? Qu'est-ce qui manque pour l'utiliser lundi ? »
7. « Qui d'autre devrais-je voir ? » (obtenir 2 noms)

## Ce qu'on note après chaque entretien

- Le problème **dans leurs mots** (pas les nôtres).
- Dernière dépense réelle liée au problème (montant, date, prestataire).
- Réaction à la démo : valeur perçue / objection principale / ce qui bloque.
- Engagement obtenu : rendez-vous suivant, accès à une vraie page, lettre d'intention, essai. (Un compliment n'est pas un engagement.)

## Critères pour continuer / arrêter

- **Continuer** si ≥ 3 sur 5 : ont dépensé de l'argent récemment sur le sujet **et** acceptent un essai sur une vraie page.
- **Pivoter** (vers la vue agents, `llms.txt`/Markdown) si l'intérêt vient surtout des cibles 4-5.
- **Arrêter / changer de cible** si personne n'a dépensé et que les réactions restent « sympa, intéressant ».

## Hypothèses à tester (écrites AVANT pour ne pas se raconter d'histoires)

1. Les organisations soumises à l'accessibilité préfèrent un correctif côté lecteur (extension / script) à une refonte.
2. Un mode de lecture adapté (dyslexie/FALC) sur le site existant a une valeur que les overlays « tout-en-un » n'ont pas, grâce au rendu vérifiable.
3. Publier une vue Markdown/IRP-Doc pour agents est perçu comme un avantage concurrentiel (visibilité dans les assistants IA), pas comme un coût.
4. Des utilisateurs concernés (dyslexie, DYS, faible vision, non-natifs) utilisent réellement le mode après l'avoir essayé 2 semaines.
