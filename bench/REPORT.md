# Rapport de benchmark IRP

*Généré par `bench/run.mjs` — 2026-11-11 — 20 pages (corpus synthétique, voir limites).*

## Résultats

| Mesure | Résultat |
|---|---|
| Faits `must_show` présents dans la page d'origine (sanité du corpus) | 100 % |
| Documents extraits valides | 20 / 20 |
| `must_show` respecté après extraction + rendu (profil standard) | 100 % — pages 100 % : 20 / 20 |
| idem profils dyslexie / FALC / basse vision | 20 / 20 / 20 pages 100 % |
| `must_show` respecté après simplification FALC | 100 % — pages 100 % : 20 / 20 |
| Garde-fou « rien de perdu » (nombres, dates, noms) après FALC | 20 / 20 pages |
| Latence extraction p50 / p95 | 1.7 ms / 6.8 ms |
| Latence rendu p50 / p95 | 0.6 ms / 3.4 ms |
| Latence adaptation (règles) p50 / p95 | 0.1 ms / 1.6 ms |
| Lisibilité (Kandel-Moles, plus haut = plus facile) | 61.4 → **65.2** |
| Mots par phrase (moyenne) | 19.3 → **15.9** |
| Phrases de plus de 20 mots | 33 → **25** |
| Violations axe-core (total) | 166 → **0** |
| dont critiques + sérieuses | 120 → **0** |
| Pages sans aucune violation axe | 0 → **20** / 20 |
| Poids : HTML → IRP-Doc (JSON) → Markdown | 32 Ko → 20 Ko → 11 Ko |
| Tokens pour un agent : HTML → Markdown | 7941 → **2851** (÷2.8) |
| IA hostile : reformulations qui auraient perdu un fait | 20 / 58 |
| … bloquées par les garde-fous / laissées passer | **20** / 0 |

Règles axe-core avant : `image-alt` ×60, `link-name` ×40, `region` ×36, `html-has-lang` ×20, `heading-order` ×10
Règles axe-core après : —

## Échecs `must_show`

Aucun.

## Limites (à lire avant de citer ces chiffres)

- **Corpus synthétique** : 20 pages françaises écrites pour reproduire des défauts courants (bruit, mises en page en tableaux, images sans alt, sauts de titres, phrases administratives longues). Ce n'est pas un échantillon du web réel : les scores d'extraction sur des pages réelles seront plus bas. Pour mesurer des pages réelles : enregistrer le HTML dans un dossier, ajouter un `manifest.json` avec les faits à conserver, lancer `node run.mjs --dir <dossier> --manifest <fichier>`.
- **axe-core sous jsdom** ne calcule pas les contrastes de couleurs (règle désactivée). Les thèmes IRP sont vérifiés par calcul (WCAG AA ≥ 4,5:1) dans `tests/core.test.mjs`, pas la page d'origine.
- La lisibilité est une **mesure automatique** (indice de Kandel-Moles, syllabes estimées), pas un FALC validé : un vrai FALC se valide avec des personnes en situation de handicap intellectuel.
- L'« IA hostile » est un adaptateur simulé qui altère des chiffres une fois sur deux ; il mesure l'efficacité des **garde-fous**, pas la qualité d'un vrai modèle.
