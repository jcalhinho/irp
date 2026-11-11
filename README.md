# ⚡ IRP — Intent Rendering Protocol

> **Un seul document de contenu, trois lecteurs : l'humain (rendu adapté), l'agent IA (Markdown/JSON), le moteur de recherche.**
> Le contenu est décrit par des composants JSON ; le rendu est déterministe ; l'IA n'adapte que le texte, sous garde-fous.

---

## 🎯 Pourquoi

- ♿ L'accessibilité est ajoutée après coup (et les « overlays » JavaScript sont contestés) : le rendu IRP est **accessible par construction** et **auditable**.
- 🤖 Les agents IA lisent désormais le web : IRP publie le **même contenu en Markdown compact**, avec `/llms.txt` et `/.well-known/irp.json`.
- 🔒 Un modèle qui génère du HTML est une surface d'attaque et un risque de dérive. IRP n'en génère jamais : **aucun HTML ne vient d'un modèle**.
- 🧠 Chacun lit à sa façon (dyslexie, faible vision, langue seconde, fatigue) : mêmes faits, présentation adaptée, **sans rien perdre** (contrat `must_show` vérifié).

## 🚀 Installer sur un site : une ligne

```html
<script src="https://VOTRE-SERVEUR/widget.js" defer></script>
```

Un bouton « Lecture adaptée » apparaît (et Alt+Maj+L). Rien n'est chargé avant le clic, aucun cookie, aucune donnée envoyée : l'extraction, l'adaptation et le rendu se font dans le navigateur du visiteur, dans un Shadow DOM fermé. Options : `data-profile="dyslexie"`, `data-label="…"`.

## 🔭 Vision

Le web actuel envoie du HTML que le navigateur affiche sans comprendre. IRP part de l'idée inverse : **le serveur envoie du sens, le navigateur l'adapte à la personne**. IRP-Doc en est la première brique, prouvable aujourd'hui (lecture, accessibilité, agents). La suite : appliquer le même principe — composants déclarés, rendu vérifié, IA cantonnée à l'adaptation — aux formulaires, tableaux de bord et applications. Le mode « intents » de la v1 (`irp-client/`) en est le prototype.

## 🧩 Ce que contient le projet

| Brique | Rôle | Dossier |
|---|---|---|
| **IRP-Doc** | format de composants JSON + validateur + rendu déterministe + profils (dyslexie, FALC, basse vision, nuit) | `irp-core/`, `irp-spec/irp-doc-v1.0.md` |
| **Mode lecture** (extension) | extrait n'importe quelle page et l'affiche adaptée, 100 % local (Alt+Maj+L) | `irp-extension/` |
| **Adaptation sous garde-fous** | règles FALC + IA locale optionnelle ; toute sortie qui perd un nombre, une date, un nom est rejetée | `irp-core/simplify.js` |
| **Vue agent** | `.md`, `.irpdoc.json`, `/llms.txt`, `/.well-known/irp.json` | `irp-server/irpdoc.py` |
| **Intents IRP** (v1) | ancien chemin : le client génère l'interface via IA (expérimental) | `irp-client/`, `irp-server/` |
| **Benchmark** | 20 pages : `must_show`, latence, axe-core, lisibilité, poids | `bench/` |

## 📊 Résultats mesurés (`bench/REPORT.md`)

Corpus **synthétique** de 20 pages françaises imparfaites (menus, cookies, images sans alt, tableaux de mise en page…). À refaire sur de vraies pages : voir `bench/README.md`.

| Mesure | Résultat |
|---|---|
| Faits `must_show` conservés (extraction → rendu → FALC) | **100 %** (20/20 pages) |
| Garde-fou « rien de perdu » après FALC | 20/20 pages |
| Violations axe-core de la page rendue (vs page d'origine) | **0** (vs 166) |
| Lisibilité (Kandel-Moles) / mots par phrase | 61.4 → **65.2** / 19.3 → **15.9** |
| Latence extraction + rendu + adaptation (p95) | 6.7 + 3 + 1.6 ms |
| Tokens pour un agent : HTML → Markdown | 7941 → **2851** (÷2.8) |
| Reformulations IA « hostiles » qui auraient perdu un fait | 20 → **0 laissée(s) passer** |

> Lecture honnête : « 0 violation axe » est vrai **par construction** pour le rendu IRP ; ce n'est pas une correction de la page d'origine.
> axe sous jsdom ne mesure pas les contrastes ; ceux des thèmes sont vérifiés par calcul (WCAG AA ≥ 4,5:1) dans `tests/core.test.mjs`.
> L'ancienne affirmation « 50x moins de bande passante » n'a **pas** été démontrée et a été retirée.

## 🌐 Outil en ligne « colle une URL »

`./start.sh` puis `http://localhost:8001/tool` : collez l'adresse d'une page publique → lecture adaptée, Markdown pour agents, contrôle « rien de perdu », défauts d'accessibilité repérés sur la page d'origine.
Le serveur ne fait que **télécharger** la page (anti-SSRF : http/https, ports 80/443, adresses publiques uniquement, connexion épinglée sur l'IP validée, redirections revalidées, taille/durée bornées — `irp-server/fetcher.py`, 25 tests). L'analyse du HTML se fait dans le navigateur (`DOMParser`), sous une CSP stricte.
Actif par défaut en local ; pour un serveur public : `--fetch` (et `IRP_FETCH_RATE`, `IRP_TRUST_PROXY=1` derrière un reverse proxy de confiance).

## 🧩 Extension « IRP Lecture » (Chrome Web Store)

`irp-reader/` : version minimale pour publication — **aucune permission d'hôte**, n'agit que sur clic/raccourci (Alt+Maj+L), sur l'onglet actif. `python3 scripts/build_reader.py` → `dist/irp-reader-<version>.zip`.
Pack de publication : `store/` (fiche FR/EN, politique de confidentialité, checklist, 5 captures). Kit de lancement : `business/launch-kit.md`. Article : `business/article.md`.

## 🔒 Sécurité

- **Pas de HTML généré** dans le chemin IRP-Doc ; l'ancien chemin (HTML produit par IA) passe par un assainisseur à liste blanche (`irp-sdk/irp-sanitizer.js`, testé sur 51 charges) et **n'exécute aucun JavaScript** (les interactions sont en CSS).
- **Proxy LLM durci** (`irp-server/proxy.py`) : jeton (`IRP_PROXY_TOKEN`), origines autorisées (`IRP_ALLOWED_ORIGINS`, jamais `*`), limite de débit (`IRP_PROXY_RATE`), JSON obligatoire (anti-CSRF), tailles bornées, modèle imposé, erreurs amont opaques. La clé `SGP_API_KEY` reste **côté serveur** ; plus de `?key=` dans l'URL.
- Le proxy se **désactive** si le serveur est exposé hors localhost sans jeton, ou sans clé (`--no-proxy` pour le couper).
- Extension : permissions minimales (`storage`, `activeTab`), mode lecture dans un **Shadow DOM fermé**.

## 🧪 Tests

```bash
python3 -m unittest discover -s tests -p "test_*.py"     # proxy, vue agent (31 tests)
(cd tests && npm install && node --test)                # sanitizer, rendu, extraction, contrat serveur↔client (50 tests)
python3 irp-server/server.py & python3 tests/e2e_test.py # e2e (27 vérifications)
node bench/run.mjs                                       # benchmark
```

## ▶️ Essayer en 2 minutes

```bash
./start.sh                      # serveur :8001 + client :3000
# http://localhost:3000/?mode=doc   → rendu déterministe, sélecteur de profil
curl localhost:8001/pricing.md       # la même page, pour un agent
curl localhost:8001/llms.txt
```
Extension : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → `irp-extension/` ; sur une page, **Alt+Maj+L**.
Après modification d'`irp-core/` : `scripts/sync-core.sh`.

## 🗺️ Suite

`business/positioning.md` (positionnement) · `business/interviews.md` (5 entretiens à mener avant d'écrire plus de code) · `irp-spec/irp-doc-v1.0.md` (spécification).

---

## 🏗️ Architecture

```
ai-runtime-web/
├── irp-core/                # IRP-Doc : validateur, rendu déterministe, FALC, extraction, vue agent (source canonique)
├── bench/                   # Benchmark 20 pages (+ REPORT.md)
├── business/                # Positionnement, kit d'entretiens
├── tests/                   # 50 tests JS (node:test + jsdom + axe-core), 31 tests Python, e2e
├── irp-server/              # Serveur IRP (Python stdlib, zéro dépendance)
│   ├── server.py            # routes intents + vue agent + proxy
│   ├── proxy.py             # proxy LLM durci
│   ├── irpdoc.py            # intents → IRP-Doc, Markdown, llms.txt
│   ├── intents/             # 9 modules d'intents
│   └── data/                # Données de démo (JSON)
├── irp-client/              # Client IRP (HTML/JS pur, pas de build)
│   ├── irp-client.js        # Orchestrateur principal
│   ├── context-sensor.js    # Détection contexte (écran, a11y, prefs, réseau)
│   ├── dom-builder.js       # Injection DOM + sanitization
│   ├── model-router.js      # Fallback chain intelligent
│   ├── cache.js             # Cache IndexedDB
│   └── renderers/
│       ├── chrome-api.js    # Chrome Prompt API (Gemini Nano, ~200ms)
│       ├── webllm.js        # WebLLM (Qwen2.5-0.5B, WebGPU, ~2-5s)
│       ├── lfm3.js          # LFM3-1.7B (ONNX Runtime Web, ~3-8s)
│       └── sgp-api.js       # SGP API (claude-qwen, ~5-30s)
├── irp-spec/                # Spec IRP v1.0
│   ├── schema.json          # JSON Schema formel (draft 2020-12)
│   ├── intents-catalog.md   # 15 intents documentés
│   └── examples/            # 4 exemples JSON
├── irp-sdk/                 # SDKs réutilisables
│   ├── irp_sdk.py           # SDK Python (10 factory helpers + @intent)
│   └── irp-sdk.js           # SDK JS (IRPClient + 3 renderers, ESM+UMD)
├── irp-extension/           # Extension navigateur Manifest V3
│   ├── manifest.json
│   ├── background.js        # Service worker coordinateur
│   ├── content.js           # Injection dans la page
│   ├── irp-renderer.js      # Patch fetch() + XHR, 3 renderers
│   ├── popup.html           # UI avec toggle + stats
│   └── popup.js
├── irp-site/                # Site de référence (démo + documentation)
│   └── index.html
├── server.py                # Phase 0 : serveur AI HTML (référence)
├── start.sh                 # Script de démarrage unique
└── AGENTS.md                # Documentation complète pour LLM
```

---

## 🚀 Démarrage rapide

### Prérequis
- Python 3.10+ (aucune dépendance pip)
- Un navigateur avec WebGPU (Chrome 113+, Edge 113+)

### Lancer

```bash
./start.sh
```

Ça démarre :
1. Le serveur IRP sur `http://localhost:8001`
2. Le client IRP sur `http://localhost:3000`
3. Ouvre le navigateur sur `http://localhost:3000`

La première visite télécharge Qwen2.5-0.5B (266MB, ~3 min). Les visites suivantes chargent le modèle depuis le cache en **1 seconde**.

### Routes disponibles

| Route | Intent | Description |
|---|---|---|
| `/` | `show_landing` | Page d'accueil marketing |
| `/product/macbook-pro-16` | `show_product` | Fiche produit e-commerce |
| `/article/irp-intro` | `read_article` | Article de blog |
| `/dashboard` | `show_dashboard` | Tableau de bord avec KPIs |
| `/catalog` | `show_catalog` | Catalogue produits avec filtres |
| `/pricing` | `show_pricing` | Tableau de tarifs |
| `/contact` | `fill_form` | Formulaire de contact |
| `/signup` | `fill_form` | Formulaire d'inscription |
| `/tasks` | `browse_list` | Liste de tâches |
| `/favorites` | `browse_list` | Liste de favoris |
| `/chat` | `show_chat` | Interface de conversation |

---

## 🧠 Model Router — Fallback chain

Le client détecte automatiquement le meilleur modèle IA disponible et l'utilise. Si un échoue, le suivant prend le relais.

```
1. Chrome Prompt API     → Gemini Nano natif     → ~200ms  (le plus rapide)
2. WebLLM                → Qwen2.5-0.5B (WebGPU) → ~2-5s   (local, pas de réseau)
3. LFM3                  → Liquid AI 1.7B (ONNX) → ~3-8s   (alternative locale)
4. SGP API               → claude-qwen (distant) → ~5-30s  (fallback cloud)
```

---

## 📦 SDKs

### Python

```python
from irp_sdk import show_product, show_landing, show_error

# Créer une réponse IRP
response = show_product(
    product_id="widget-42",
    name="Super Widget",
    price={"amount": 29.99, "currency": "EUR"},
    specs=[{"label": "Weight", "value": "150g"}],
)

# Sérialiser
print(response.to_json())   # → JSON string
print(response.headers())   # → {"Content-Type": "application/irp+json; charset=utf-8"}
print(response.body())      # → bytes UTF-8

# Ou avec le décorateur @intent
from irp_sdk import intent, IRPResponse

@intent("show_custom")
def my_handler(user_id):
    return IRPResponse(
        intent="show_custom",
        data={"user_id": user_id, "greeting": "Bonjour"},
    )
```

### JavaScript

```javascript
import { IRPClient } from './irp-sdk/irp-sdk.js';

const client = new IRPClient({
  server: 'http://localhost:8001',
  mount: '#app',
});

await client.init();         // détecte les renderers IA disponibles
await client.navigate('/');  // fetch IRP + rendu local
await client.clearCache();   // vider le cache
```

---

## 🔌 Extension navigateur

**Nouveau — Mode lecture adapté** (`reader.js`) : sur n'importe quelle page, Alt+Maj+L (ou le popup) extrait le contenu et l'affiche avec le profil choisi (dyslexie, FALC, basse vision, nuit), dans un Shadow DOM fermé, sans réseau. Le bouton « IA locale » utilise la Chrome Prompt API si elle existe ; une reformulation qui perdrait un nombre, une date ou un nom est refusée et le badge l'indique. Échap ferme et rend le focus à la page.

L'interception des réponses `application/irp+json` (ancien chemin) reste disponible :

L'extension Chrome/Firefox intercepte les réponses `application/irp+json` sur **n'importe quel site** et les rend localement.

1. Ouvrir `chrome://extensions`
2. Activer "Developer mode"
3. "Load unpacked" → sélectionner `irp-extension/`
4. L'extension patche automatiquement `fetch()` et `XMLHttpRequest`

Le popup permet de :
- Activer/désactiver l'interception
- Choisir le renderer (auto, Chrome, WebLLM, SGP)
- Configurer l'URL du proxy SGP
- Voir les stats en temps réel (interceptés, rendus, cache hits, erreurs)

---

## 📐 Spec IRP v1.0

### Format

```json
{
  "irp": {
    "version": "1.0",
    "intent": "show_product",
    "data": { ... },
    "constraints": {
      "must_show": ["name", "price"],
      "priority": "conversion",
      "content_type": "commercial"
    },
    "context_hints": {
      "cacheable": true,
      "ttl": 3600
    },
    "actions": [
      { "id": "add_to_cart", "label": "Ajouter au panier", "type": "primary", "href": "/cart/add/123", "method": "POST" }
    ],
    "metadata": {
      "title": "MacBook Pro 16 — 2799€",
      "lang": "fr"
    }
  }
}
```

### Content-Type

```
Content-Type: application/irp+json; charset=utf-8
```

### Catalogue d'intents (15)

`show_landing` · `show_product` · `show_catalog` · `read_article` · `fill_form` · `show_dashboard` · `browse_list` · `show_profile` · `show_search` · `play_media` · `show_map` · `show_chat` · `show_pricing` · `show_docs` · `show_error`

Voir [`irp-spec/intents-catalog.md`](irp-spec/intents-catalog.md) pour la documentation complète.

---

## ♿ Accessibilité

IRP génère des interfaces accessibles **nativement** :

- L'IA détecte `prefers-contrast: more` → contrastes élevés
- L'IA détecte `prefers-reduced-motion: reduce` → pas d'animations
- L'IA détecte `prefers-reduced-data: reduce` → design épuré
- L'IA génère une structure sémantique HTML5 (section, article, nav, button)
- L'IA ajoute des attributs ARIA quand nécessaire
- L'IA adapte la taille de police selon les préférences

**Conformité EU 2025** : la loi européenne sur l'accessibilité entre en vigueur en 2025. 96% des sites ne sont pas conformes. IRP résout ce problème par design.

---

## 🔒 Privacy

- Les modèles IA tournent **localement** (Chrome Prompt API, WebLLM, LFM3)
- Les données utilisateur ne **quittent jamais** le navigateur
- Le cache est stocké dans **IndexedDB** (local au navigateur)
- Le seul fallback distant (SGP API) envoie uniquement l'intent + data (pas de données personnelles)

---

## 🗺️ Roadmap

- [x] **Phase 1 — POC** : serveur IRP + client + 4 renderers + test navigateur live
- [x] **Phase 2 — Spec + SDK** : JSON Schema + catalogue 15 intents + SDK Python + SDK JS
- [x] **Phase 3 — Extension** : Manifest V3, intercepte fetch+XHR, popup avec stats
- [ ] **Phase 4 — B2B Accessibilité** : exploiter la loi EU 2025 (96% sites non conformes)
- [ ] **Phase 5 — Modèles plus performants** : LFM3-1.7B en production, Gemma-2B, Phi-3-mini
- [ ] **Phase 6 — IRP spec v1.1** : streaming intents, SSR fallback, SEO via prerender
- [ ] **Phase 7 — Standard W3C/WHATWG** : proposer `application/irp+json` comme standard
- [ ] **Phase 8 — Marketplace d'intents** : bibliothèque d'intents réutilisables

---

## 📄 Licence

MIT — voir [LICENCE](LICENCE)

---

## 🤝 Contribuer

Voir [`AGENTS.md`](AGENTS.md) pour la documentation complète destinée aux développeurs et aux LLM.

---

<p align="center">
  <strong>⚡ IRP — Le web qui se code lui-même dans le navigateur.</strong><br>
  Le navigateur devient un agent IA actif. Fini le frontend tel qu'on le connaît.
</p>
