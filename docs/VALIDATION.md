# Validation de la version de lecture — 12 novembre 2026

Version vérifiée localement dans le dépôt, avant publication. Les résultats navigateur détaillés sont dans [validation-results.json](validation-results.json). Les captures utilisent le courrier fictif livré avec l’application, sans données personnelles.

## Vérifications réussies

| Vérification | Résultat | Portée |
|---|---|---|
| Tests JavaScript | 72 / 72 | Format, sécurité du rendu, fidélité heuristique, extraction, contrats Python/JS, utilitaires de lecture |
| Tests Python | 60 / 60 | Récupération publique, refus SSRF, proxy, vues agent et routes |
| Tests HTTP historiques | 27 / 27 | Routes, CORS, négociation et proxy désactivé |
| Scénario navigateur | 28 contrôles réussis | Chromium 158.0.8127.18 ; clavier, préférences, mobile, exports, concurrence et pages réelles |
| axe-core dans Chromium | 0 violation détectée sur les 3 écrans contrôlés | Accueil, lecteur bureau et lecteur mobile à 390 px, contraste inclus |
| Version statique | Réussite | Erreur d’URL expliquée et collage fonctionnel sans backend |
| Extension MV3 1.3.0 | Réussite | Paquet réellement chargé dans un profil Chromium temporaire ; action avec activeTab, simplification, retour au texte extrait, téléchargement HTML et restauration de la page après Échap |
| Assemblage | Réussite | `dist-site/` et `dist/irp-reader-1.3.0.zip` |

Le scénario navigateur télécharge la lecture `.html`, bloque le réseau d’un nouvel onglet et y ouvre le document exporté. Le texte reste lisible. L’import HTML hostile ne déclenche ni son script ni la requête d’image distante. Une réponse URL retardée ne remplace pas un texte collé plus récemment.

## Pages publiques effectivement ouvertes

| Page | Texte extrait (caractères) | Entrées de sommaire |
|---|---:|---:|
| [Introduction à Python](https://docs.python.org/fr/3/tutorial/introduction.html) | 18 473 | 5 |
| [Service Public : renouvellement du passeport d’un mineur](https://www.service-public.gouv.fr/particuliers/vosdroits/F21092) | 65 218 | 59 |
| [Wikipédia : Lecture](https://fr.wikipedia.org/wiki/Lecture) | 50 907 | 39 |
| [MDN : Introduction à JavaScript](https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Introduction) | 11 169 | 11 |

Les quatre pages ont produit une lecture et un sommaire. Ce sont des essais fonctionnels ponctuels, pas un corpus représentatif ni une validation manuelle exhaustive des informations. Sur Service Public, le lecteur déroule plusieurs cas de la page interactive : le résultat est long et ne remplace pas son parcours de questions.

## Régressions corrigées

- Suppression d’une négation, changement avant/après, obligation devenue possibilité, négation ou valeur déplacée entre phrases : sortie IA refusée dans les cas de test.
- Un nombre n’est plus accepté parce qu’il est une sous-chaîne d’un autre (`50` / `150`). Les cellules de tableaux ne sont plus collées lors du contrôle du rendu.
- Le nettoyage des zones de bruit fonctionne sur le clone détaché de la page. Les petits fragments de texte ne sont plus ignorés.
- Les chargements concurrents sont annulables ; le collage retire l’ancien lien partageable ; changer de lien partagé dans le même onglet lance la bonne lecture.
- Le HTML source est analysé dans un template inerte avant extraction. Le HTML collé est traité comme texte ; un fichier `.html` suit le chemin d’import explicite.
- Les documents exportés sont autonomes, sans scripts ou ressources distantes. Les copies Markdown conservent le texte extrait sans simplification.
- Le démarrage refuse un port occupé sans tuer de processus. Les assemblages n’effacent plus leurs dossiers de sortie.

## Reproduire

```sh
npm ci --prefix tests
(cd tests && npx playwright install chromium)
bash scripts/sync-core.sh
(cd tests && node --test)
python3 -m unittest discover -s tests -p 'test_*.py'
npm run --prefix tests test:browser
```

Le scénario navigateur démarre et arrête ses propres serveurs sur des ports disponibles. Il utilise un profil Chromium temporaire pour l’extension, sans modifier le profil utilisateur, et régénère les résultats et captures dans `docs/`. Les quatre essais sur pages publiques nécessitent une connexion et dépendent de leur disponibilité.

Pour les 27 contrôles HTTP historiques : lancer `./start.sh --no-open` dans un terminal, puis `python3 tests/e2e_test.py` dans un autre.

## Ce qui n’est pas démontré

- L’équivalence sémantique de toute reformulation. Les filtres sont conservateurs, mais heuristiques ; ils ne détectent pas toute inversion de sujet, unité, causalité ou portée d’une condition.
- La présence de tout le contenu de la page source. L’extraction retire des zones et ne reproduit ni formulaires, ni vidéos, ni interactions ; elle peut se tromper sur la zone principale.
- Une amélioration de compréhension pour de vrais utilisateurs, une certification FALC ou une conformité d’accessibilité.
- La compatibilité Firefox et Safari, les performances sur tous les appareils ou une inférence IA locale réelle. L’IA n’est pas requise dans le lecteur principal.
- Une publication sur le Web Store ou la mise à jour de l’hébergement public. Les livrables vérifiés ici sont locaux et prêts à distribuer.
