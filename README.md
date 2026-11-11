# ⚡ IRP — Intent Rendering Protocol

> **Le web qui se code lui-même dans le navigateur.**
> Le serveur envoie des intentions, pas du HTML. Le navigateur génère l'interface via IA locale.

---

## 🎯 Le problème

Depuis 30 ans, le modèle web est : **serveur → HTML/CSS/JS → navigateur passif qui affiche**.

Le navigateur ne "pense" pas, il exécute. Conséquences :
- 📦 100-500KB transférés par page (HTML + CSS + JS + fonts + images)
- 🔧 Build step obligatoire (Webpack, Vite, Next.js)
- 📱 Responsive design générique (media queries pour tous)
- ♿ Accessibilité en post-traitement (96% des sites non conformes)
- 🧠 Un même document servi à un senior, un enfant, un dev — adapté à personne

## 💡 La solution

**Inverser le modèle** : le serveur envoie une **intention** (JSON 2KB), et c'est le **navigateur** qui, via un agent IA embarqué, génère l'interface optimale pour CET utilisateur, CETTE machine, CE contexte.

```
Aujourd'hui:  Serveur ──HTML/CSS/JS (500KB)──► Navigateur (passif) ──► Utilisateur

IRP:          Serveur ──intent + data (2KB)──► Navigateur (actif)
                                                │
                                                ├─ Détecte le contexte (écran, a11y, prefs)
                                                ├─ Choisit le meilleur modèle IA local
                                                ├─ Génère le DOM optimal
                                                └─ Injecte + cache le résultat
```

---

## 📊 Résultats

| Métrique | Web classique | IRP |
|---|---|---|
| Bande passante par page | 100-500KB | **2KB** (50x moins) |
| Build step | Requis | **Aucun** |
| Framework frontend | React/Vue/Svelte | **Aucun** |
| CSS framework | Tailwind/Bootstrap | **Aucun** (l'IA génère) |
| Accessibilité | Post-trichage ARIA | **Native** (l'IA adapte) |
| Personnalisation | Générique (media queries) | **Unique par utilisateur** |
| Privacy | Données envoyées au serveur | **Locale** (WebGPU) |

---

## 🏗️ Architecture

```
ai-runtime-web/
├── irp-server/              # Serveur IRP (Python stdlib, zéro dépendance)
│   ├── server.py            # 12 routes + proxy SGP + CORS
│   ├── intents/             # 8 modules d'intents
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
