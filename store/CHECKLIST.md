# Publier l'extension sur le Chrome Web Store — pas à pas

Ce que **vous** devez faire (je ne peux pas le faire à votre place : compte et paiement) :

1. **Compte développeur** : https://chrome.google.com/webstore/devconsole — frais uniques d'inscription (5 USD à ma connaissance ; à vérifier sur la page).
2. **Construire le paquet** : `python3 scripts/build_reader.py` → `dist/irp-reader-1.2.0.zip`.
3. **Tester en local avant d'envoyer** : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → `dist/irp-reader/`. Ouvrez une page, cliquez sur l'icône → « Lire cette page ».
4. **Nouvel élément** → importer le zip.
5. **Fiche** : copier le texte de `store/listing-fr.md` (puis `listing-en.md` pour la version anglaise). Catégorie : Accessibilité.
6. **Captures** : importer les 5 images de `store/screenshots/` (1280×800). Ordre conseillé : 4-avant, 1-simplifie, 2-dyslexie, 3-basse-vision, 5-en-ligne.
7. **Confidentialité** : publier `store/PRIVACY.md` (la page `/privacy` du serveur l'affiche une fois les crochets remplis), renseigner son URL, déclarer « aucune donnée collectée », justifier les 3 autorisations (texte fourni dans la fiche).
8. **Distribution** : public, tous pays (ou France d'abord). Soumettre à la revue (quelques jours en général).

## Avant de soumettre
- Remplacer les `[crochets]` de `PRIVACY.md` (éditeur, e-mail, durée des journaux).
- Vérifier le nom de l'éditeur et l'e-mail de contact du compte développeur.
- Une icône promotionnelle 440×280 est facultative.

## Pourquoi cette extension passera mieux la revue que l'ancienne `irp-extension/`
Pas de permission d'hôte, pas de script injecté automatiquement sur toutes les pages, pas de modification de `fetch()`. Elle n'agit que sur clic, sur l'onglet actif.
(L'ancienne `irp-extension/` — interception IRP — reste un outil de développement : ne pas la publier.)

## Limite de test à connaître
Le fonctionnement complet a été testé sous Chromium avec une autorisation d'hôte temporaire (l'automatisation ne peut pas simuler le « geste utilisateur » qui accorde `activeTab`). Le comportement `activeTab` après clic est celui documenté par Chrome ; faites le test manuel de l'étape 3.
