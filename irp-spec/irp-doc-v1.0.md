# IRP-Doc 1.0 — document de composants

**Statut** : brouillon implémenté (`irp-core/`), validé par 50 tests JS + 31 tests Python.
**Idée** : une page = un document JSON de composants. Le même document sert **trois publics** :
les humains (rendu déterministe adapté à leur profil), les agents IA (Markdown compact, JSON-LD), les moteurs (SEO).

## Pourquoi pas du HTML généré par IA ?

| | HTML généré par un LLM | IRP-Doc rendu de façon déterministe |
|---|---|---|
| Résultat | différent à chaque appel | identique à chaque visite |
| Sécurité | surface XSS ouverte (assainisseur à maintenir) | **aucun HTML** : seuls `createElement`/`textContent` |
| Audit / conformité | impossible à certifier | le rendu est du code revu une fois |
| Accessibilité | « au mieux » | par construction (landmarks, h1 unique, titres sans saut, `scope`, focus visible) |
| Rôle de l'IA | tout produire | **adapter le texte seulement**, sortie vérifiée |

## Format

```json
{
  "irp_doc": "1.0",
  "lang": "fr",
  "title": "Carte nationale d'identité",
  "description": "optionnel",
  "url": "https://mairie.example/carte",
  "must_show": ["25 €", "15 mars 2027"],
  "blocks": [ { "type": "heading", "level": 2, "text": "Délais" }, … ],
  "structured": { "@context": "https://schema.org", "@type": "Product", … }
}
```

Texte *inline* : `string` ou tableau de segments `string | {t:"a",href,text} | {t:"b",text} | {t:"em",text}`.

| `type` | Champs |
|---|---|
| `heading` | `level` 1-6, `text` |
| `text` | `text` |
| `list` | `ordered?`, `items[]` (inline) |
| `steps` | `items[{title?, text}]` |
| `table` | `caption?`, `headers[]`, `rows[][]` (inline) |
| `facts` | `items[{label, value}]` (prix, dates, coordonnées : données, jamais reformulées) |
| `actions` | `items[{label, href, primary?}]` |
| `callout` | `kind` info/warning/success/danger, `title?`, `text` |
| `quote` | `text`, `cite?` |
| `code` | `text` |
| `image` | `alt`, `src?` (https ou relatif ; non chargée par défaut) |
| `section` | `title?`, `blocks[]` (6 niveaux max) |

Il n'y a volontairement ni `html`, ni `script`, ni `style`, ni `form` dans cette version.

## Contrat `must_show`

L'émetteur liste les chaînes **indispensables** (prix, échéances, numéros). Le client vérifie après rendu
(`verifyMustShow`) qu'elles sont toutes affichées. Sans vérité terrain (pages réelles), `verifyPreserved`
exige que tout **nombre, date, montant, e-mail, URL et nom propre** du document d'origine soit présent dans le texte affiché.

## Modèle de sécurité

1. `validateDoc` : types stricts, limites (5 000 blocs, profondeur 6, 20 000 car./champ), URLs `http(s)`/`mailto`/`tel`/relatives uniquement
   (contrôle des contournements `java\tscript:`, `//hôte`, caractères invisibles).
2. Rendu : DOM construit nœud par nœud ; images distantes **non chargées** par défaut (pas de pistage) ; `rel=noopener noreferrer`.
3. CSS généré **uniquement** depuis des valeurs bornées du profil — jamais depuis le contenu.
4. Mode lecture de l'extension : Shadow DOM **fermé** + `inert` sur la page ; rien ne quitte l'appareil.
5. Adaptation par IA : la sortie est **rejetée** si elle perd un nombre/date/montant/nom, contient des balises, est vide ou trop longue → repli sur les règles déterministes.

## Profils (rendu)

`standard`, `dyslexie`, `falc`, `basse_vision`, `lecture_nuit` (+ profil objet borné : thème, police, taille 0,8-2,5, espacement, largeur 30-120 ch).
Thèmes : toutes les paires texte/fond ≥ 4,5:1 (contraste élevé ≥ 7:1), vérifié par test.
Le profil « dyslexie » applique les espacements WCAG 1.4.12 (interligne 1,8, lettres 0,12 em, mots 0,16 em) et une colonne étroite ;
la police est une pile lisible (Atkinson Hyperlegible / Lexend / Verdana) — **l'effet des polices « pour dyslexiques » est faiblement établi** ; les espacements et la largeur de ligne sont mieux étayés.
Le « langage simplifié » est une **aide de lecture automatique**, pas un FALC certifié (qui exige une relecture par des personnes en situation de handicap intellectuel).

## Vue agent (HTTP)

| Requête | Réponse |
|---|---|
| `GET /page.irpdoc.json` ou `Accept: application/irp-doc+json` | IRP-Doc |
| `GET /page.md` ou `Accept: text/markdown` | Markdown compact |
| `GET /llms.txt` | index des pages (convention llmstxt.org) |
| `GET /.well-known/irp.json` | manifeste : formats, pages, accès |

Contenu public en lecture seule : CORS ouvert, sans cookies, `nosniff`, `Vary: Accept`.

## Conformité d'un émetteur

1. Produit des documents acceptés par `validateDoc`.
2. Renseigne `must_show` pour les faits critiques.
3. Publie au moins `/.well-known/irp.json`.

Suite de tests de référence : `tests/core.test.mjs`, `tests/contract.test.mjs` (le serveur Python et le client JS se valident mutuellement, Markdown identique).
