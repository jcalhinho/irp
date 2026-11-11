# Positionnement

## En une phrase

**IRP rend n'importe quel contenu lisible, vérifiable et adapté — pour chaque personne et pour chaque agent IA — sans refaire le site.**

## Ce qui a changé par rapport à la première idée

| Avant (POC) | Maintenant |
|---|---|
| « Le serveur n'envoie plus de HTML ; l'IA génère l'interface » | Le serveur (ou un extracteur) publie un **document de composants** ; le rendu est **déterministe** ; l'IA ne fait qu'**adapter du texte**, sous contrôle |
| Argument : « 50x moins de bande passante » (non démontré) | Arguments **mesurés** : accessibilité par construction (axe 166 → 0 violations sur le corpus), `must_show` tenu à 100 %, ÷2,5 de tokens pour un agent |
| Cible : « tout le web » | Coin d'entrée : **lecture adaptée** (dyslexie, FALC, basse vision) sur les sites existants + **vue agent** |
| Risque : XSS, non-déterminisme, coût par page | Aucun HTML produit par un modèle ; rendu local ; sortie IA vérifiée |

## Pourquoi c'est la bonne direction (arguments, pas certitudes)

1. **Les agents deviennent des lecteurs.** Un site qui publie un Markdown propre, un manifeste et un index (`llms.txt`) est lu plus fiablement que du HTML à scraper. Le même document sert l'humain.
2. **L'obligation d'accessibilité est là** (RGAA en France, directive européenne en vigueur depuis juin 2025 pour une partie du privé) et les correctifs « overlay » sont critiqués. Un rendu **accessible par construction** et **auditable** répond mieux que du JavaScript qui bricole la page.
3. **Les modèles locaux** (Chrome Prompt API, WebLLM) rendent possible l'adaptation de texte **sans envoyer les données** à un tiers — mais seulement s'ils restent sous garde-fous (c'est le rôle de `adaptText`).
4. **La confiance est le goulot** : « l'IA a-t-elle perdu mon prix / ma date ? ». Le contrat `must_show` + `verifyPreserved` transforme cette peur en test automatique.

## Ce qu'on ne prétend pas

- Pas de FALC certifié, pas de « remplace l'audit RGAA ».
- Le corpus de benchmark est synthétique ; les pages réelles feront baisser l'extraction. À mesurer avec de vrais sites (voir `bench/README.md`).
- Aucune preuve encore que quelqu'un paie : c'est l'objet de `business/interviews.md`.

## Offre candidate (à valider par les entretiens)

1. **Gratuit** : extension « Mode lecture adapté » (local, sans compte).
2. **Éditeurs** : kit « vue agent » (`/llms.txt`, `.md`, `/.well-known/irp.json`, IRP-Doc) pour un site existant + tableau de bord de conformité (`must_show`, axe).
3. **Collectivités** : script d'intégration du mode lecture + rapport de benchmark sur leurs pages.
