# Publication du 12 novembre 2026

**Site public : https://irp-lecture.netlify.app/**

La nouvelle interface a été publiée sur le projet Netlify existant `irp-lecture`, avec Netlify Drop. Aucun changement des permissions Chrome, de l’audience du site ou du domaine n’a été nécessaire.

- Déploiement publié : `6af5ac0fe9fa2776531b8ec2`.
- [Détails Netlify](https://app.netlify.com/projects/irp-lecture/deploys/6af5ac0fe9fa2776531b8ec2).
- Source de l’interface : commit `172af9a31140dd34ba5d8951d20744dc8c15e0b1`, poussé sur `main` dans `jcalhinho/irp`.
- Paquet : 27 fichiers, archive de 385 306 octets.
- SHA-256 du paquet : `f99ede7ff1f268ae9f9eb22d87b28cf4ab323a9b5a1c72c957f41bc937155e5c`.

## Vérification après publication

Le script `node tests/verify-production.mjs` vérifie le site public, et pas une copie locale :

- Les six ressources contrôlées (JavaScript, CSS, cœur du rendu et deux polices) correspondent exactement aux fichiers du paquet validé.
- Six parcours ont réussi : Chromium, Firefox et WebKit, chacun à 390 et 1 440 px.
- Le collage est présenté par défaut ; l’exemple ouvre une lecture ; la simplification produit des passages comparables ; le téléchargement HTML contient le texte et aucun script.
- Les polices sont chargées et le document ne déborde pas horizontalement.
- Les routes `/tool`, `/privacy` et `/local` sont accessibles.
- Les deux audits axe exécutés en production n’ont détecté aucune violation.

Résultats : [production-results.json](production-results.json). Captures du site public : [ordinateur](screenshots/public-desktop.png) et [téléphone](screenshots/public-mobile.png).

La matrice locale plus large (16 formats par moteur, 336 contrôles de disposition) est dans [responsive-results.json](responsive-results.json).

## Périmètre de la version en ligne

La version hébergée est statique : collage, import de fichiers, réglages, comparaison, impression et exports. L’ouverture directe d’une page par son adresse nécessite l’application locale Python ; l’interface l’indique avant une tentative. L’extension n’a pas été publiée sur le Web Store dans cette opération.

Les déploiements Netlify sont manuels ; pousser `main` ne suffit pas à mettre à jour ce site. Pour une future publication : assembler `dist-site/`, valider, envoyer ce dossier ou son archive sur **le projet existant**, puis vérifier la version effectivement servie.
