# IRP — Catalogue d'Intents v1.0

Le catalogue d'intents définit les types de rendu supportés par IRP.
Chaque intent a un schéma de données attendu et des contraintes par défaut.

## Intents de base (15)

### 1. `show_landing` — Page d'accueil marketing

**Description** : Page d'accueil d'un site ou d'un produit. Objectif : engager l'utilisateur.

**Data attendue** :
- `title` (string, requis) — Titre principal
- `tagline` (string) — Slogan
- `description` (string) — Description du projet
- `features` (array) — Liste de fonctionnalités [{ icon, title, description }]
- `links` (array) — Liens de navigation [{ label, href, type }]
- `models` (array, optionnel) — Modèles IA disponibles (pour le debug)

**Constraints par défaut** :
- `must_show`: ["title", "features"]
- `priority`: "engagement"
- `content_type`: "marketing"

---

### 2. `show_product` — Fiche produit e-commerce

**Description** : Page produit avec prix, specs, et call-to-action.

**Data attendue** :
- `id` (string, requis) — Identifiant produit
- `name` (string, requis) — Nom du produit
- `price` (object, requis) — { amount, currency }
- `category` (string) — Catégorie
- `specs` (array) — Spécifications [{ label, value }]
- `description` (string) — Description
- `images` (array) — URLs d'images
- `actions` (array) — Boutons d'action [{ id, label, type, href }]
- `rating` (object) — { score, count }
- `availability` (string) — "in_stock" | "out_of_stock" | "preorder"

**Constraints par défaut** :
- `must_show`: ["name", "price"]
- `priority`: "conversion"
- `content_type`: "commercial"

---

### 3. `show_catalog` — Liste/grille de produits

**Description** : Catalogue de produits avec filtres et tri.

**Data attendue** :
- `title` (string, requis)
- `products` (array, requis) — Liste de produits (même format que show_product.data)
- `filters` (array) — Filtres disponibles [{ id, label, options }]
- `sort_options` (array) — Options de tri [{ id, label }]
- `pagination` (object) — { page, total_pages, per_page }
- `total_count` (integer) — Nombre total de produits

**Constraints par défaut** :
- `must_show`: ["products"]
- `priority`: "conversion"
- `content_type`: "commercial"

---

### 4. `read_article` — Article de blog/presse

**Description** : Article avec titre, auteur, sections, et métadonnées.

**Data attendue** :
- `id` (string, requis)
- `title` (string, requis)
- `author` (string)
- `date` (string) — ISO 8601
- `reading_time` (string) — ex: "5 min"
- `tags` (array) — Liste de tags
- `excerpt` (string) — Résumé
- `sections` (array, requis) — [{ heading, content }]

**Constraints par défaut** :
- `must_show`: ["title", "sections"]
- `priority`: "readability"
- `content_type`: "editorial"

---

### 5. `fill_form` — Formulaire

**Description** : Formulaire interactif (contact, inscription, commande).

**Data attendue** :
- `id` (string, requis)
- `title` (string, requis)
- `description` (string)
- `fields` (array, requis) — [{ id, label, type, required, placeholder, options, validation }]
- `submit` (object, requis) — { label, href, method }
- `cancel` (object) — { label, href }

**Constraints par défaut** :
- `must_show`: ["title", "fields", "submit"]
- `priority`: "clarity"
- `content_type`: "interactive"

---

### 6. `show_dashboard` — Tableau de bord

**Description** : Dashboard avec KPIs, graphiques, et activité.

**Data attendue** :
- `title` (string, requis)
- `user` (object) — { name, role }
- `last_updated` (string) — ISO 8601
- `kpi_cards` (array, requis) — [{ label, value, change, trend }]
- `chart` (object) — { type, title, data }
- `recent_activity` (array) — [{ time, action, detail, model, latency }]
- `model_usage` (array) — [{ model, count, percentage }]

**Constraints par défaut** :
- `must_show`: ["title", "kpi_cards"]
- `priority`: "data_density"
- `content_type`: "analytical"

---

### 7. `browse_list` — Liste générique

**Description** : Liste d'éléments générique (todos, résultats, favoris).

**Data attendue** :
- `title` (string, requis)
- `items` (array, requis) — [{ id, label, description, status, actions }]
- `empty_message` (string) — Message si liste vide
- `filters` (array) — Filtres disponibles
- `sortable` (boolean) — Tri possible

**Constraints par défaut** :
- `must_show`: ["items"]
- `priority`: "data_density"
- `content_type`: "informational"

---

### 8. `show_profile` — Profil utilisateur

**Description** : Page de profil avec infos et activité.

**Data attendue** :
- `id` (string, requis)
- `name` (string, requis)
- `avatar` (string) — URL ou identifiant SVG
- `bio` (string)
- `stats` (array) — [{ label, value }]
- `actions` (array) — [{ id, label, type, href }]
- `recent_activity` (array)

**Constraints par défaut** :
- `must_show`: ["name"]
- `priority`: "engagement"
- `content_type`: "informational"

---

### 9. `show_search` — Résultats de recherche

**Description** : Résultats de recherche avec facets.

**Data attendue** :
- `query` (string, requis) — Requête de recherche
- `results` (array, requis) — [{ id, title, excerpt, href, type, score }]
- `facets` (array) — [{ id, label, options, count }]
- `total_count` (integer)
- `suggestions` (array) — Suggestions de recherche alternatives

**Constraints par défaut** :
- `must_show`: ["query", "results"]
- `priority`: "data_density"
- `content_type`: "informational"

---

### 10. `play_media` — Lecteur vidéo/audio

**Description** : Lecteur média avec contrôles et métadonnées.

**Data attendue** :
- `id` (string, requis)
- `title` (string, requis)
- `type` (string) — "video" | "audio"
- `src` (string, requis) — URL du média
- `poster` (string) — URL du poster (vidéo)
- `duration` (string) — Durée formatée
- `description` (string)
- `chapters` (array) — [{ time, title }]

**Constraints par défaut** :
- `must_show`: ["title", "src"]
- `priority`: "engagement"
- `content_type`: "interactive"

---

### 11. `show_map` — Carte interactive

**Description** : Carte avec points d'intérêt.

**Data attendue** :
- `title` (string, requis)
- `center` (object) — { lat, lng }
- `zoom` (integer)
- `markers` (array, requis) — [{ id, lat, lng, label, description, icon }]
- `routes` (array) — [{ id, points, color }]

**Constraints par défaut** :
- `must_show`: ["markers"]
- `priority`: "data_density"
- `content_type`: "interactive"

---

### 12. `show_chat` — Interface de conversation

**Description** : Interface de chat avec messages.

**Data attendue** :
- `id` (string, requis)
- `title` (string, requis)
- `messages` (array, requis) — [{ id, role, content, timestamp }]
- `input` (object) — { placeholder, endpoint, method }
- `participants` (array) — [{ id, name, avatar }]

**Constraints par défaut** :
- `must_show`: ["messages", "input"]
- `priority`: "engagement"
- `content_type`: "interactive"

---

### 13. `show_pricing` — Tableau de tarifs

**Description** : Plans tarifaires avec comparaison.

**Data attendue** :
- `title` (string, requis)
- `plans` (array, requis) — [{ id, name, price, currency, period, features, highlighted, cta }]
- `billing_toggle` (object) — { monthly, yearly, discount }
- `faq` (array) — [{ question, answer }]

**Constraints par défaut** :
- `must_show`: ["plans"]
- `priority`: "conversion"
- `content_type`: "commercial"

---

### 14. `show_docs` — Documentation technique

**Description** : Documentation avec sommaire et sections.

**Data attendue** :
- `title` (string, requis)
- `version` (string)
- `toc` (array, requis) — Table des matières [{ id, title, children }]
- `sections` (array, requis) — [{ id, heading, content, code_examples }]
- `navigation` (object) — { prev, next }

**Constraints par défaut** :
- `must_show`: ["title", "sections"]
- `priority`: "readability"
- `content_type`: "editorial"

---

### 15. `show_error` — Page d'erreur

**Description** : Page d'erreur (404, 500, 403, etc.).

**Data attendue** :
- `status` (string, requis) — Code d'erreur (ex: "404")
- `message` (string, requis) — Message d'erreur
- `path` (string) — Chemin qui a causé l'erreur
- `links` (array) — Liens de récupération [{ label, href, type }]
- `suggestions` (array) — Suggestions de pages alternatives

**Constraints par défaut** :
- `must_show`: ["status", "message"]
- `priority`: "clarity"
- `content_type`: "error"

---

## Ajouter un nouvel intent

1. Définir le nom (snake_case)
2. Définir le schéma de data attendu
3. Définir les constraints par défaut
4. Ajouter un exemple dans `examples/`
5. Documenter dans ce fichier
6. Implémenter le module dans `irp-server/intents/`
