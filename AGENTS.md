# AGENTS.md — IRP (Intent Rendering Protocol)

> Le web qui se code lui-même dans le navigateur.
> Le serveur envoie des **intentions**, pas du HTML. Le navigateur génère l'interface via un agent IA local.

---

## 1. VISION

### Le problème

Depuis 30 ans, le modèle web est : **serveur → HTML/CSS/JS → navigateur passif qui affiche**.

Le navigateur ne "pense" pas, il exécute. Le serveur décide tout : le layout, le CSS, le JS, l'accessibilité, le responsive. Conséquences :

- Chaque device = expérience différente à maintenir (responsive, mobile, tablet, desktop)
- Bande passante énorme (500KB+ par page en moyenne)
- Accessibilité ajoutée après coup, coûteuse, 96% des sites non conformes
- Frontend = complexité exponentielle (React, Vue, Svelte, build tools, bundlers...)
- Un même document servi à un senior, un enfant, un dev, un bot — adapté à personne

### La solution

**Inverser le modèle** : le serveur envoie une **description d'intention** (IRP — Intent Rendering Protocol), et c'est le **navigateur** qui, via un agent IA embarqué, génère l'interface optimale pour CET utilisateur, CETTE machine, CE contexte.

```
Aujourd'hui:  Serveur ──HTML/CSS/JS (500KB)──► Navigateur (passif) ──► Utilisateur

IRP:          Serveur ──intent + data (2-10KB)──► Navigateur (actif)
                                                   │
                                                   ├─ Agent IA local
                                                   ├─ Connaît l'utilisateur (prefs, a11y, hardware)
                                                   ├─ Génère le DOM optimal
                                                   └─ Affiche
```

### Pourquoi c'est révolutionnaire

- **50x moins de bande passante** (2-10KB d'IRP vs 500KB de HTML/CSS/JS)
- **Accessibilité native** : l'IA adapte l'interface au handicap de l'utilisateur en temps réel
- **Pas de build, pas de framework, pas de CSS** — l'IA locale fait tout
- **Personnalisation totale** : même URL, interface différente selon qui visite
- **Fin du frontend tel qu'on le connaît** : le serveur ne fait plus de présentation

---

## 2. HISTORIQUE DU PROJET

### Phase 0 — POC initial "AI Runtime Web" (terminé)

**Objectif initial** : remplacer le build step par des agents IA qui génèrent le HTML à la volée côté serveur.

**Ce qui a été fait** :
- Serveur Python (`server.py`) qui appelle un LLM pour générer du HTML complet à chaque requête
- Modèle : `claude-qwen` via SGP LLMaaS (`https://llmasservice.sgp.fr/v1`)
- Clé API auto-détectée depuis `~/.local/share/opencode/auth.json` (clé SGP)
- Routes : `/` (accueil), `/page/<sujet>` (page dynamique), `/url/<url>` (s'inspire d'une page web existante), `/__cache` (debug), `/__cache/clear` (vider cache)
- Cache en mémoire pour éviter les régénérations
- Mode démo (fallback) sans clé API
- Tests validés : 25KB de HTML généré par claude-qwen en ~30-90s par page

**Conclusion de la Phase 0** : le concept fonctionne mais n'est pas vendable tel quel. La génération côté serveur à chaque requête est trop lente (30-90s), trop coûteuse, non-déterministe, et ne résout pas le vrai problème. Le build n'est pas supprimé, il est déplacé.

**Fichier existant** : `server.py` (serveur HTTP Python stdlib, ~18KB)

### Pivot — Vers le navigateur actif (Phase 1+)

Le pivot : au lieu de générer le HTML côté serveur, le serveur envoie des **intents** et c'est le **navigateur** qui génère l'interface via un agent IA local. C'est le concept IRP.

---

## 3. ÉTAT DE L'ART — Modèles IA embarqués navigateur (novembre 2026)

### Runtime 1 : Chrome Prompt API (window.ai)

- **Modèle** : Gemini Nano (intégré à Chrome)
- **Statut** : Shipped — Chrome 148 (web), Chrome 138 (extensions)
- **API** : `LanguageModel`, `promptStreaming()`, `responseConstraint` (JSON Schema ou regex)
- **Latence** : ~200ms (natif, pas de WASM)
- **RAM** : >4GB VRAM ou 16GB RAM + 4 cores
- **Disk** : ~22GB (téléchargement lazy per-origin)
- **Langues** : en, ja, es, de, fr
- **Limitation** : pas d'accès Web Worker, pas de modèle personnalisable
- **Output structuré** : ✅ via `responseConstraint` (JSON Schema)
- **Documentation** : https://developer.chrome.com/docs/ai/prompt-api

### Runtime 2 : WebLLM (WebGPU + WASM)

- **Site** : https://webllm.mlc.ai/
- **Architecture** : MLC-LLM/TVM compilé en WebGPU kernels + WASM
- **Performance** : jusqu'à 80% de la performance native (arXiv 2412.15803)
- **API** : compatible OpenAI (chat completions, JSON mode)
- **Modèles supportés** (avec VRAM requis) :
  - SmolLM2-360M : 376MB
  - Llama-3.2-1B : 879MB
  - Qwen2.5-0.5B : 945MB
  - Qwen3-0.6B : 1403MB
  - Phi-3.5/Phi-4-mini : 3438MB
  - Gemma : variable
- **LFM support** : ❌ pas de prebuild (grep config → zéro résultat pour `lfm|liquid`)
- **Output structuré** : ✅ JSON mode dans la lib WASM

### Runtime 3 : ONNX Runtime Web / Transformers.js

- **Usage** : pour les modèles qui ne sont pas dans WebLLM
- **LFM3-1.7B** : checkpoints ONNX disponibles sur HuggingFace
- **Space HuggingFace** : `fusorlabs/liquidai-lmf3-wasm` (LFM3 en WASM)
- **Output structuré** : ✅ via tool calling natif de LFM3

### Modèle : Liquid AI LFM3-1.7B

- **Architecture** : tri-hybride (pas un transformer pur — plus efficace)
- **Params** : 1.73B
- **Contexte** : 256K tokens
- **Taille 4-bit** : ~1GB
- **Capacités** : tool calling, structured outputs, ONNX/GGUF/MLX/OpenVINO checkpoints
- **Limitation** : pas recommandé pour l'agentic coding, mais bon pour le rendering structuré
- **HuggingFace** : https://huggingface.co/LiquidAI/LFM3-1.7B

### Modèle : Liquid AI LFM2

- **Tailles** : 350M, 700M, 1.2B, 2.6B
- **Contexte** : 32K
- **HuggingFace** : https://huggingface.co/LiquidAI/LFM2-1.2B

### Seuil de viabilité pour générer du HTML/DOM en temps réel

- **Minimum** : ~0.5-0.8B params en 4-bit (0.9-1.6GB RAM)
- **Latence attendue** : 2-5s pour une page complète, 0.5-1.5s au premier token
- **Téléchargement initial** : 0.4-2GB (one-time, caché ensuite)
- **Recommandation** : Qwen2.5-0.5B (WebLLM) ou LFM3-1.7B (ONNX) pour le local, Chrome Prompt API pour le plus rapide

---

## 4. LE PROTOCOLE IRP — Intent Rendering Protocol

### Format

```json
{
  "irp": {
    "version": "1.0",
    "intent": "show_product",
    "data": {
      "id": "mbp-16",
      "name": "MacBook Pro 16\"",
      "price": { "amount": 2799, "currency": "EUR" },
      "specs": [
        { "label": "CPU", "value": "M4 Max" },
        { "label": "RAM", "value": "36GB" }
      ],
      "images": ["https://cdn.example.com/mbp1.webp"],
      "actions": [
        { "id": "buy", "type": "primary", "href": "/api/order" },
        { "id": "compare", "type": "secondary", "href": "/compare" }
      ]
    },
    "constraints": {
      "must_show": ["name", "price"],
      "priority": "conversion",
      "content_type": "commercial"
    },
    "context_hints": {
      "requires_auth": false,
      "cacheable": true,
      "ttl": 3600
    }
  }
}
```

### Content-Type

```
Content-Type: application/irp+json
```

### Les 3 couches

| Couche | Rôle | Contrôlé par | Exemple |
|---|---|---|---|
| **Intent** | Ce que l'utilisateur veut faire | Serveur | `show_product`, `read_article`, `fill_form` |
| **Data** | Les données brutes, sans présentation | Serveur | `{ name, price, specs }` |
| **Constraints** | Les règles métier (ce qui DOIT être affiché) | Serveur | `must_show: ["price"]`, `priority: "conversion"` |

Le navigateur reçoit ces 3 couches et l'IA décide **comment** les rendre. Le serveur garde le contrôle sur les données et les règles, le navigateur prend le contrôle sur la présentation.

### Catalogue d'intents v1 (15 intents)

```
show_product     → fiche produit e-commerce
show_catalog     → liste/grille de produits
read_article     → article de blog/presse
fill_form        → formulaire (contact, inscription, commande)
show_dashboard   → tableau de bord avec widgets
browse_list      → liste générique (todos, résultats, etc.)
show_profile     → profil utilisateur
show_search      → résultats de recherche
play_media       → lecteur vidéo/audio
show_map         → carte interactive
show_chat        → interface de conversation
show_landing     → page d'accueil marketing
show_pricing     → tableau de tarifs
show_docs        → documentation technique
show_error       → page d'erreur
```

### Contexte envoyé par le navigateur (header ou query param)

```json
{
  "screen": { "width": 1920, "height": 1080, "dpr": 2, "orientation": "landscape" },
  "a11y": { "contrast": "high", "fontSize": "large", "screenReader": true, "reducedMotion": true },
  "prefs": { "theme": "dark", "lang": "fr", "density": "compact" },
  "device": { "type": "desktop", "ram": 16, "cores": 8, "gpu": true },
  "network": { "type": "4g", "downlink": 10 },
  "battery": { "level": 0.85, "charging": true }
}
```

---

## 5. ARCHITECTURE TECHNIQUE

### Vue d'ensemble

```
┌─────────────────┐     IRP (JSON 2-10KB)      ┌──────────────────────────────┐
│  Serveur IRP    │ ──────────────────────────► │  Client IRP (PWA)            │
│  (Python stdlib)│   Content-Type:             │                              │
│                 │   application/irp+json      │  ┌────────────────────────┐  │
│  Sert des       │                             │  │  IRP Receiver          │  │
│  intents JSON   │                             │  │  (fetch + parse IRP)   │  │
│                 │                             │  └───────────┬────────────┘  │
│  Pas de HTML,   │                             │              ▼               │
│  pas de CSS,    │                             │  ┌────────────────────────┐  │
│  pas de JS      │                             │  │  Model Router          │  │
│                 │                             │  │  (choisit le meilleur  │  │
│                 │                             │  │   LLM selon contexte)  │  │
│                 │                             │  └───────────┬────────────┘  │
│                 │                             │     ┌────────┼────────┐      │
│                 │                             │     ▼        ▼        ▼      │
│                 │                             │  ┌──────┐ ┌──────┐ ┌──────┐ │
│                 │                             │  │Chrome│ │WebLLM│ │ SGP  │ │
│                 │                             │  │ API  │ │Qwen  │ │claude│ │
│                 │                             │  │~200ms│ │0.5B  │ │-qwen │ │
│                 │                             │  │      │ │~2-5s │ │~5-30s│ │
│                 │                             │  └──────┘ └──────┘ └──────┘ │
│                 │                             │              │               │
│                 │                             │              ▼               │
│                 │                             │  ┌────────────────────────┐  │
│                 │                             │  │  DOM Builder           │  │
│                 │                             │  │  (injecte le HTML      │  │
│                 │                             │  │   généré dans la page) │  │
│                 │                             │  └────────────────────────┘  │
│                 │                             │                              │
│                 │                             │  ┌────────────────────────┐  │
│                 │                             │  │  Context Sensor        │  │
│                 │                             │  │  • screen, DPR, orient │  │
│                 │                             │  │  • a11y prefs          │  │
│                 │                             │  │  • theme, lang         │  │
│                 │                             │  │  • network, battery    │  │
│                 │                             │  └────────────────────────┘  │
└─────────────────┘                             └──────────────────────────────┘
```

### Model Router — logique de sélection

| Condition | Modèle choisi | Pourquoi |
|---|---|---|
| Chrome Prompt API dispo + intent simple | Gemini Nano | Le plus rapide (~200ms) |
| WebGPU dispo + intent moyen | WebLLM Qwen 0.5B ou LFM3 | Local, pas de réseau |
| Intent complexe (dashboard, form) | API SGP claude-qwen | Qualité supérieure |
| Hors ligne | WebLLM (cache) | Pas de réseau |
| Device faible (pas de WebGPU) | API SGP | Pas de ressource locale |

### Fallback chain (ordre de priorité)

```
1. Chrome Prompt API (window.ai)     → si disponible, le plus rapide
2. WebLLM (Qwen2.5-0.5B via WebGPU)  → si WebGPU disponible
3. LFM3-1.7B (via ONNX Runtime Web)  → alternative locale
4. API SGP (claude-qwen)             → fallback distant, toujours disponible
```

---

## 6. STRUCTURE DU PROJET

```
ai-runtime-web/
├── AGENTS.md                    ← Ce fichier (documentation complète)
├── server.py                    ← Phase 0 : serveur HTTP qui génère du HTML via LLM (existante, à conserver comme référence)
│
├── irp-server/                  ← Phase 1 : serveur IRP
│   ├── server.py                ← Serveur qui sert des intents JSON (Content-Type: application/irp+json)
│   ├── intents/                 ← Définitions des intents
│   │   ├── __init__.py
│   │   ├── show_product.py      ← Intent: fiche produit
│   │   ├── read_article.py      ← Intent: article
│   │   └── show_dashboard.py    ← Intent: dashboard
│   └── data/                    ← Données de démo
│       ├── products.json
│       ├── articles.json
│       └── dashboard.json
│
├── irp-client/                  ← Phase 1 : client IRP (PWA)
│   ├── index.html               ← Point d'entrée (pas de build, HTML pur)
│   ├── irp-client.js            ← Client principal (fetch IRP, orchestre le rendu)
│   ├── model-router.js          ← Sélection du modèle (Chrome API → WebLLM → SGP)
│   ├── renderers/
│   │   ├── chrome-api.js        ← Renderer Chrome Prompt API (window.ai)
│   │   ├── webllm.js            ← Renderer WebLLM (WebGPU + WASM)
│   │   ├── lfm3.js              ← Renderer LFM3 (ONNX Runtime Web)
│   │   └── sgp-api.js           ← Renderer API SGP (claude-qwen distant)
│   ├── context-sensor.js        ← Détecte le contexte (screen, a11y, device, network)
│   ├── dom-builder.js           ← Construit et injecte le DOM
│   ├── cache.js                 ← Cache local des rendus (IndexedDB)
│   └── style.css                ← Styles minimaux (loading states, erreurs)
│
├── irp-spec/                    ← Phase 2 : spec du protocole
│   ├── schema.json              ← JSON Schema formel d'IRP (draft 2020-12)
│   ├── spec-v1.1.md             ← Spec v1.1 (streaming, SSR, SEO, actions, metadata) ← NOUVEAU
│   ├── intents-catalog.md       ← Catalogue des 15 intents
│   └── examples/                ← Exemples IRP pour chaque intent
│
├── irp-sdk/                     ← Phase 2 : SDKs réutilisables
│   ├── irp_sdk.py               ← SDK Python (10 factory helpers + @intent)
│   └── irp-sdk.js               ← SDK JS (IRPClient + 3 renderers, ESM+UMD)
│
├── irp-extension/               ← Phase 3 : extension navigateur Manifest V3
│   ├── manifest.json
│   ├── background.js            ← Service worker coordinateur
│   ├── content.js               ← Injection dans la page
│   ├── irp-renderer.js          ← Patch fetch() + XHR, 3 renderers
│   ├── popup.html               ← UI avec toggle + stats
│   └── popup.js
│
├── irp-site/                    ← Site de référence
│   ├── index.html               ← Landing page marketing
│   ├── docs.html                ← Documentation interactive irp.dev ← NOUVEAU
│   └── article.md               ← Article technique de positionnement ← NOUVEAU
│
├── tests/                       ← Tests
│   └── e2e_test.py              ← Tests E2E automatisés (24 tests) ← NOUVEAU
│
├── start.sh                     ← Script de démarrage unique
├── README.md                    ← Documentation GitHub
└── AGENTS.md                    ← Ce fichier
```

---

## 7. PLAN DE DÉVELOPPEMENT DÉTAILLÉ

### Phase 1 : POC — Client IRP + serveur (semaines 1-3)

#### Étape 1.1 — Serveur IRP (semaine 1)

**Fichier** : `irp-server/server.py`

**Objectif** : un serveur Python (stdlib) qui sert des intents JSON au lieu de HTML.

**Spécifications** :
- Serveur HTTP avec `http.server` (zéro dépendance)
- Content-Type : `application/irp+json`
- Routes :
  - `GET /` → intent `show_landing` (page d'accueil du projet)
  - `GET /product/<id>` → intent `show_product` avec données produit
  - `GET /article/<id>` → intent `read_article` avec données article
  - `GET /dashboard` → intent `show_dashboard` avec données dashboard
  - `GET /__intents` → liste tous les intents disponibles (debug)
  - `GET /__health` → healthcheck
- Données de démo en JSON statique dans `irp-server/data/`
- Chaque intent est défini dans `irp-server/intents/` comme un module Python qui retourne un dict IRP

**Exemple de réponse** :
```json
{
  "irp": {
    "version": "1.0",
    "intent": "show_product",
    "data": { "name": "MacBook Pro 16\"", "price": { "amount": 2799, "currency": "EUR" } },
    "constraints": { "must_show": ["name", "price"], "priority": "conversion" }
  }
}
```

**Critères d'acceptation** :
- [ ] Le serveur démarre sur un port configurable
- [ ] Toutes les routes retournent du JSON valide avec Content-Type `application/irp+json`
- [ ] Les intents respectent le format IRP (version, intent, data, constraints)
- [ ] `GET /__intents` liste tous les intents disponibles
- [ ] Tests : `python3 -m pytest tests/test_server.py` (ou script shell)

#### Étape 1.2 — Client IRP basique (semaine 2)

**Fichiers** : `irp-client/index.html`, `irp-client.js`, `context-sensor.js`, `dom-builder.js`, `style.css`

**Objectif** : une PWA (HTML/JS pur, pas de build, pas de framework) qui reçoit des intents et génère le DOM.

**Spécifications** :
- `index.html` : page vide avec un `<div id="irp-root"></div>` et les scripts
- `irp-client.js` : 
  - Fetch l'IRP depuis le serveur
  - Détecte le contexte utilisateur (via `context-sensor.js`)
  - Passe l'IRP + le contexte au model router
  - Récupère le HTML généré
  - L'injecte dans `#irp-root` via `dom-builder.js`
- `context-sensor.js` :
  - `getScreen()` : width, height, dpr, orientation
  - `getA11y()` : contrast pref, font size, screenReader, reducedMotion (via `matchMedia`)
  - `getPrefs()` : theme (dark/light via `prefers-color-scheme`), lang, density
  - `getDevice()` : type (mobile/tablet/desktop), ram, cores, gpu (via `navigator`)
  - `getNetwork()` : type, downlink (via `navigator.connection`)
  - `getBattery()` : level, charging (via `navigator.getBattery()`)
- `dom-builder.js` :
  - `inject(html)` : injecte le HTML dans `#irp-root`
  - `sanitize(html)` : sanitise basique (enlève les scripts externes)
  - `showLoading()` / `showError(msg)` : états de chargement/erreur
- `style.css` : styles minimaux pour les loading states et erreurs (le reste est généré par l'IA)

**Critères d'acceptation** :
- [ ] Le client fetch un IRP depuis le serveur et affiche le rendu
- [ ] Le contexte utilisateur est détecté et passé au renderer
- [ ] Les états de loading et erreur sont gérés
- [ ] Pas de build step, pas de framework, pas de npm — HTML/JS pur

#### Étape 1.3 — Renderer API SGP (semaine 2)

**Fichier** : `irp-client/renderers/sgp-api.js`

**Objectif** : renderer de fallback qui appelle claude-qwen via SGP LLMaaS.

**Spécifications** :
- Classe `SGPRenderer` avec méthode `render(irp, context)`
- Construit un prompt à partir de l'IRP + contexte :
  - System prompt : "Tu es un moteur de rendu IRP. Génère UNIQUEMENT du HTML..."
  - User prompt : JSON de l'IRP + JSON du contexte
- Appelle `POST https://llmasservice.sgp.fr/v1/chat/completions`
- Modèle : `claude-qwen`
- Clé API : passée via config ou URL param (pour le POC)
- Retourne le HTML généré (nettoyé du markdown si présent)
- Gestion d'erreurs : timeout, API error, réseau

**Critères d'acceptation** :
- [ ] Le renderer génère du HTML valide à partir d'un IRP
- [ ] Le HTML s'adapte au contexte (dark/light, screen size, a11y)
- [ ] Les erreurs sont gérées proprement

#### Étape 1.4 — Renderer Chrome Prompt API (semaine 3)

**Fichier** : `irp-client/renderers/chrome-api.js`

**Objectif** : renderer prioritaire utilisant Gemini Nano natif dans Chrome.

**Spécifications** :
- Classe `ChromeAPIRenderer` avec méthode `render(irp, context)`
- Détecte si `window.ai` ou `LanguageModel` est disponible
- Si oui, utilise `LanguageModel.create()` avec un system prompt IRP
- Utilise `responseConstraint` pour forcer du HTML valide si possible
- Utilise `promptStreaming()` pour streamer le rendu
- Si non disponible, retourne `null` (le model router passe au suivant)

**Détection** :
```javascript
async function isAvailable() {
  return 'LanguageModel' in window || 'ai' in window;
}
```

**Critères d'acceptation** :
- [ ] Détection correcte de la disponibilité de Chrome Prompt API
- [ ] Si disponible, génère du HTML via Gemini Nano
- [ ] Si non disponible, retourne null (fallback vers le suivant)
- [ ] Streaming du rendu si possible

#### Étape 1.5 — Renderer WebLLM (semaine 3)

**Fichier** : `irp-client/renderers/webllm.js`

**Objectif** : renderer local utilisant WebLLM (WebGPU + WASM) avec Qwen2.5-0.5B.

**Spécifications** :
- Classe `WebLLMRenderer` avec méthode `render(irp, context)`
- Charge WebLLM via CDN (pas de build) : `<script type="module" src="https://esm.run/@mlc-ai/web-llm"></script>`
- Détecte si WebGPU est disponible : `'gpu' in navigator`
- Si oui, charge le modèle `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (945MB)
- Affiche une barre de progression pendant le téléchargement du modèle
- Génère le HTML via le modèle local
- Si WebGPU non disponible, retourne `null`

**Critères d'acceptation** :
- [ ] Détection correcte de WebGPU
- [ ] Chargement du modèle avec progression
- [ ] Génération de HTML valide
- [ ] Si WebGPU non disponible, retourne null

#### Étape 1.6 — Model Router (semaine 3)

**Fichier** : `irp-client/model-router.js`

**Objectif** : orchestre les renderers selon le contexte et les capacités.

**Spécifications** :
- Classe `ModelRouter` qui prend une liste de renderers ordonnés
- Méthode `render(irp, context)` :
  1. Vérifie le cache local (IndexedDB) — si le rendu existe pour cet IRP + contexte, le retourne
  2. Sinon, essaie chaque renderer dans l'ordre :
     - Chrome API → si dispo + intent simple
     - WebLLM → si WebGPU dispo
     - SGP API → toujours disponible (fallback)
  3. Si un renderer retourne null ou échoue, passe au suivant
  4. Cache le résultat dans IndexedDB
- Logique de sélection intelligente :
  - Intent simple (show_product, read_article) → Chrome API ou WebLLM
  - Intent complexe (show_dashboard, fill_form) → SGP API (qualité supérieure)
  - Hors ligne → WebLLM uniquement
  - Device faible → SGP API (pas de ressource locale)

**Critères d'acceptation** :
- [ ] Le router essaie les renderers dans l'ordre et fallback correctement
- [ ] Le cache local fonctionne (IndexedDB)
- [ ] La logique de sélection s'adapte au contexte

### Phase 2 : Spec IRP + SDK (semaines 4-8)

#### Étape 2.1 — JSON Schema formel
- `irp-spec/schema.json` : JSON Schema complet d'IRP v1.0
- Valide : version, intent, data, constraints, context_hints

#### Étape 2.2 — Catalogue d'intents
- `irp-spec/intents-catalog.md` : documentation des 15 intents
- `irp-spec/examples/` : un exemple IRP par intent

#### Étape 2.3 — SDK Python
- `irp-server/sdk.py` : `irp.serve(intent, data, constraints)` → génère une réponse IRP
- Helpers pour chaque intent

#### Étape 2.4 — SDK JS
- `irp-client/irp-sdk.js` : `IRPRenderer` class réutilisable
- Documentation d'intégration

### Phase 3 : Extension navigateur (semaines 9-16)

#### Étape 3.1 — Extension Chrome/Firefox
- Intercepte les réponses `Content-Type: application/irp+json`
- Les passe au moteur de rendu IA local
- Injecte le DOM généré

#### Étape 3.2 — Détection automatique
- Si le serveur envoie de l'IRP, l'extension rend
- Sinon, comportement normal du navigateur

#### Étape 3.3 — Préférences utilisateur
- UI pour configurer : a11y, thème, langue, densité
- Persistance des préférences

### Phase 4 : Cas d'usage B2B — Accessibilité (semaines 17-26)

#### Étape 4.1 — Conversion HTML → IRP
- L'extension convertit le HTML existant en IRP pour les sites qui ne supportent pas IRP nativement
- Permet de rendre n'importe quel site accessible

#### Étape 4.2 — Modes d'accessibilité
- Mode malvoyant : gros texte, contraste élevé, descriptions
- Mode daltonisme : palette adaptée
- Mode dyslexie : police adaptée, espacement
- Mode lecteur d'écran : structure sémantique optimisée
- Mode cognitif : simplification de l'interface

#### Étape 4.3 — Pilotes B2B
- Contacter des entreprises soumises à l'obligation d'accessibilité (loi UE 2025)
- Administrations publiques
- E-commerce

---

## 8. CONFIGURATION ET DÉPLOIEMENT

### Serveur IRP

```bash
# Démarrer le serveur IRP
python3 irp-server/server.py --port 8000

# Variables d'environnement optionnelles
export IRP_PORT=8000
export IRP_HOST=localhost
```

### Client IRP

```bash
# Servir le client (n'importe quel serveur statique)
python3 -m http.server 3000 --directory irp-client

# Puis ouvrir http://localhost:3000
# Le client fetch les IRP depuis http://localhost:8000
```

### Clé API SGP (pour le renderer distant)

La clé est auto-détectée depuis `~/.local/share/opencode/auth.json` :
```json
{
  "sgp": {
    "type": "api",
    "key": "sk-..."
  }
}
```

Pour le client (côté navigateur), la clé est passée via config ou URL param (POC uniquement — en production, le serveur proxy les appels API).

### Configuration Chrome Prompt API

1. Chrome 138+ (extensions) ou Chrome 148+ (web)
2. Activer `chrome://flags/#prompt-api-for-gemini-nano`
3. Télécharger le modèle via `chrome://components` (Gemini Nano)
4. Vérifier : `console.log('LanguageModel' in window)`

### Configuration WebLLM

Aucune configuration nécessaire. WebLLM se charge via CDN et utilise WebGPU automatiquement si disponible.

---

## 9. CONVENTIONS DE CODE

### Python (serveur)
- Python 3.9+ (stdlib uniquement, zéro dépendance)
- Type hints
- Docstrings pour chaque fonction
- `if __name__ == "__main__":` dans chaque fichier exécutable

### JavaScript (client)
- ES modules (`import`/`export`)
- Pas de framework, pas de build, pas de transpilation
- Pas de npm/node — le client est servi en HTML/JS pur
- Classes ES6 pour les renderers
- `async/await` pour les opérations asynchrones
- Commentaires en français

### Structure des renderers

Chaque renderer implémente cette interface :

```javascript
class BaseRenderer {
  constructor(config) { this.config = config; }

  async isAvailable() {
    // Retourne true si ce renderer peut fonctionner sur ce navigateur
    throw new Error('Not implemented');
  }

  async render(irp, context) {
    // Retourne du HTML valide (string) à partir de l'IRP + contexte
    // Retourne null si le renderer ne peut pas gérer cet intent
    throw new Error('Not implemented');
  }

  getName() {
    // Retourne le nom du renderer pour les logs
    throw new Error('Not implemented');
  }
}
```

### Nommage
- Fichiers : `kebab-case.js`, `snake_case.py`
- Classes : `PascalCase`
- Variables/fonctions : `camelCase` (JS), `snake_case` (Python)
- Intents : `snake_case` (`show_product`, `read_article`)

---

## 10. TESTS

### Tests serveur
```bash
# Tests du serveur IRP
python3 -m pytest tests/test_server.py

# Ou script shell
bash tests/test_e2e.sh
```

### Tests client
- `tests/test_client.html` : page de test qui charge le client et vérifie les renderers
- Vérifie : détection du contexte, fetch IRP, rendu, cache

### Tests end-to-end
```bash
# Démarrer le serveur IRP
python3 irp-server/server.py --port 8000 &

# Tester les routes
curl -s http://localhost:8000/product/macbook-pro | python3 -m json.tool
curl -s http://localhost:8000/article/irp-intro | python3 -m json.tool
curl -s http://localhost:8000/dashboard | python3 -m json.tool
curl -s http://localhost:8000/__intents | python3 -m json.tool
```

---

## 11. BUSINESS MODEL

### Marchés cibles

| Segment | Taille | Douleur | Timing |
|---|---|---|---|
| Accessibilité web | Croissant | Loi UE 2025, 96% sites non conformes | Immédiat |
| E-commerce | Énorme | Maintenance responsive coûteuse | Court terme |
| Low-bandwidth / mobile | Émergent | 3 milliards en connexion lente | Moyen terme |
| Enterprise dashboards | Moyen | Frontend multi-device coûteux | Court terme |

### Modèles de revenus

1. **Protocole + runtime** (play long terme) : IRP ouvert, runtime pro payant
2. **SaaS rendering-as-a-service** : pay-per-render pour les sites sans IRP natif
3. **Navigateur premium** : freemium B2C
4. **B2B accessibilité** : le premier revenu réaliste (obligation légale)

### Projection

| Phase | Durée | Revenu | Investissement |
|---|---|---|---|
| POC + extension | 6 mois | 0€ | Temps personnel |
| Pilote B2B (a11y) | 6-12 mois | 10-50K€/an | 1-2 devs |
| Adoption protocole | 2-3 ans | 100K-1M€/an | 5-10 devs + levée |
| Si adoption | 5+ ans | 10M€+/an | Scale-up |

---

## 12. RISQUES ET MITIGATIONS

| Risque | Impact | Mitigation |
|---|---|---|
| Google ne supporte pas IRP dans Chrome | Élevé | Extension Chrome (pas besoin de leur permission) + Firefox/Safari |
| SEO impossible (pas de HTML indexable) | Élevé | SSR IRP→HTML pour les bots + nouveau format sitemap |
| Non-déterminisme de l'IA | Moyen | Cache + seeds + constraints strictes |
| Modèles locaux trop lents | Moyen | Fallback chain (Chrome API → WebLLM → API distante) |
| Adoption développeurs lente | Élevé | SDK qui convertit React/Vue existant en IRP automatiquement |
| Coût API pour le fallback distant | Faible | Cache agressif + modèles locaux prioritaires |

---

## 13. POINTS À DÉCIDER (open questions)

1. **Sécurité** : comment empêcher un serveur malveillant d'envoyer un IRP qui manipule l'IA pour cacher des informations importantes ? → Constraints auditables + sandbox du rendu ?

2. **Versioning** : comment gérer l'évolution du protocole IRP ? → Champ `version` + négociation client/serveur ?

3. **Interactivité** : l'IA génère le DOM initial, mais comment gérer les interactions (clics, formulaires) ? → Le DOM généré contient du JS qui parle IRP au serveur ?

4. **Offline** : comment gérer le mode hors ligne ? → Service Worker + cache IndexedDB + WebLLM local ?

5. **Standardisation** : faut-il soumettre IRP au W3C/IETF ? → Oui, mais après validation du POC.

6. **Monétisation du protocole** : si IRP est ouvert, comment monétiser ? → Runtime de référence pro + services valeur ajoutée.

---

## 14. LOG DES DÉCISIONS

| Date | Décision | Raison |
|---|---|---|
| 2026-11-10 | Pivot : génération côté serveur → génération côté navigateur | Le modèle serveur est trop lent (30-90s), trop cher, non-déterministe. Le navigateur actif est le vrai changement révolutionnaire. |
| 2026-11-10 | Choix de claude-qwen via SGP comme fallback distant | Clé API déjà disponible dans la config OpenCode, modèle performant, endpoint SGP interne |
| 2026-11-10 | Choix de Chrome Prompt API comme renderer prioritaire | Le plus rapide (~200ms), natif dans Chrome, supporte le JSON Schema contraint |
| 2026-11-10 | Choix de WebLLM (Qwen2.5-0.5B) comme renderer local secondaire | 945MB seulement, WebGPU, JSON mode, pas de dépendance Chrome |
| 2026-11-10 | Choix de LFM3-1.7B comme alternative locale à explorer | Architecture tri-hybride efficace, tool calling natif, ~1GB en 4-bit, checkpoints ONNX dispo |
| 2026-11-10 | Format IRP : JSON avec intent + data + constraints | Sépare les responsabilités : serveur contrôle les données, navigateur contrôle la présentation |
| 2026-11-10 | Pas de build, pas de framework pour le client | Le client doit être aussi léger que possible — c'est la preuve que le frontend n'est plus nécessaire |
| 2026-11-10 | Premier cas d'usage B2B : accessibilité | Obligation légale UE 2025, budget garanti, douleur immédiate |

---

## 15. COMMENT CONTRIBUER (pour les autres LLM/agents)

### Avant de coder
1. Lire ce fichier en entier
2. Vérifier l'étape en cours dans la todo list
3. Lire les fichiers concernés par l'étape

### Pendant le dev
1. Respecter les conventions de code (section 9)
2. Pas de dépendances externes pour le serveur Python (stdlib uniquement)
3. Pas de build/npm/framework pour le client JS (HTML/JS pur)
4. Tester chaque changement
5. Mettre à jour ce fichier si une décision change

### Après le dev
1. Signer l'étape avec `complete_step`
2. Mettre à jour la section 7 (cocher les critères d'acceptation)
3. Ajouter une entrée dans la section 14 (log des décisions) si décision importante

### Priorité des renderers (ne pas changer sans discussion)
```
1. Chrome Prompt API (window.ai)     → priorité 1 (le plus rapide)
2. WebLLM (Qwen2.5-0.5B via WebGPU)  → priorité 2 (local, pas de réseau)
3. LFM3-1.7B (via ONNX Runtime Web)  → priorité 3 (alternative locale)
4. API SGP (claude-qwen)             → priorité 4 (fallback distant)
```

### Endpoints API SGP
- Base URL : `https://llmasservice.sgp.fr/v1`
- Modèle : `claude-qwen`
- Clé : auto-détectée depuis `~/.local/share/opencode/auth.json` → `sgp.key`
- Endpoint : `POST /chat/completions`
- Format : OpenAI-compatible

### Fichiers de référence
- `server.py` : serveur Phase 0 (référence, à conserver mais ne pas modifier)
- `irp-server/server.py` : serveur IRP (12 routes, proxy SGP, CORS)
- `irp-client/` : client IRP (9 fichiers JS, HTML pur, pas de build)
- `irp-spec/` : spec IRP v1.0 (JSON Schema + catalogue 15 intents + 4 exemples)
- `irp-sdk/irp_sdk.py` : SDK Python (IRPResponse + 10 factory helpers + décorateur @intent)
- `irp-sdk/irp-sdk.js` : SDK JS (IRPClient + 3 renderers + cache IndexedDB, export ESM+UMD)
- `irp-extension/` : extension navigateur Manifest V3 (6 fichiers, intercepte fetch+XHR)
- `irp-site/index.html` : site de référence (démo + documentation)

---

## 16. ÉTAT DU PROJET (session 2026-11-10, historique)

### ✅ Phase 1 — POC (terminé)
- Serveur IRP Python stdlib (zéro dépendance) — 12 routes, Content-Type `application/irp+json`
- Client IRP HTML/JS pur (pas de build, pas de framework) — 9 fichiers
- 4 renderers IA intégrés : Chrome Prompt API → WebLLM (Qwen2.5-0.5B) → LFM3-1.7B → SGP API (claude-qwen)
- Model Router intelligent avec fallback chain + cache IndexedDB
- Context Sensor : viewport, DPR, theme, a11y, lang, network, battery, touch
- **Testé en navigateur live** : WebLLM a téléchargé Qwen2.5-0.5B (266MB), chargé en WebGPU, généré une page HTML complète localement à partir d'un intent JSON de 2KB
- Proxy SGP côté serveur (l'API SGP ne supporte pas CORS navigateur)
- CORS preflight (do_OPTIONS) ajouté au serveur

### ✅ Phase 2 — Spec + SDK (terminé)
- **Spec IRP v1.0** : JSON Schema formel (draft 2020-12), catalogue de 15 intents documentés, 4 exemples JSON
- **SDK Python** (`irp-sdk/irp_sdk.py`) : classe IRPResponse, 10 factory helpers (show_landing, show_product, read_article, show_dashboard, fill_form, show_error, show_pricing, show_chat, show_catalog, browse_list), décorateur @intent + registry, fonction validate()
- **SDK JavaScript** (`irp-sdk/irp-sdk.js`) : classe IRPClient avec init/navigate/clearCache, IRPResponse, ContextSensor, IRPCache (IndexedDB), 3 renderers intégrés, export ESM + UMD (window.IRP.create())
- **9 intents implémentés** sur le serveur : show_landing, show_product, read_article, show_dashboard, show_catalog, fill_form (3 variantes), browse_list (2 variantes), show_pricing, show_chat
- **Site de référence** (`irp-site/index.html`) : documentation publique + 9 liens de démo live

### ✅ Phase 3 — Extension navigateur (terminé)
- Extension Manifest V3 (6 fichiers) : manifest.json, background.js, content.js, irp-renderer.js, popup.html, popup.js
- Intercepte `fetch()` et `XMLHttpRequest` pour les réponses `application/irp+json`
- 3 renderers avec fallback chain (Chrome API → WebLLM → SGP)
- Cache localStorage, loading states, injection DOM
- Popup avec toggle on/off, sélecteur de renderer, champ proxy SGP, 4 stats temps réel
- Badge dynamique avec compteur d'interceptions

### Tests finaux (12/12 routes passent)
```
✅ / → show_landing
✅ /product/macbook-pro-16 → show_product
✅ /article/irp-intro → read_article
✅ /dashboard → show_dashboard
✅ /catalog → show_catalog
✅ /contact → fill_form
✅ /signup → fill_form
✅ /tasks → browse_list
✅ /favorites → browse_list
✅ /pricing → show_pricing
✅ /chat → show_chat
✅ /bizarre → show_error (404)
✅ Content-Type: application/irp+json; charset=utf-8
✅ CORS preflight: 204 No Content
```

### Structure du projet
```
ai-runtime-web/
├── AGENTS.md                    # Ce fichier (798+ lignes)
├── server.py                    # Phase 0 : serveur AI HTML (référence)
├── irp-server/                  # Serveur IRP (Python stdlib)
│   ├── server.py                # 12 routes + proxy SGP + CORS
│   ├── intents/                 # 8 modules d'intents
│   │   ├── __init__.py
│   │   ├── show_product.py
│   │   ├── read_article.py
│   │   ├── show_dashboard.py
│   │   ├── show_catalog.py
│   │   ├── fill_form.py
│   │   ├── browse_list.py
│   │   ├── show_pricing.py
│   │   └── show_chat.py
│   └── data/                    # Données de démo (JSON)
│       ├── products.json
│       ├── articles.json
│       └── dashboard.json
├── irp-client/                  # Client IRP (HTML/JS pur)
│   ├── index.html
│   ├── style.css
│   ├── irp-client.js            # Orchestrateur principal
│   ├── context-sensor.js        # Détection contexte utilisateur
│   ├── dom-builder.js           # Injection DOM sécurisée
│   ├── model-router.js          # Fallback chain intelligent
│   ├── cache.js                 # Cache IndexedDB
│   └── renderers/
│       ├── chrome-api.js        # Chrome Prompt API (Gemini Nano)
│       ├── webllm.js            # WebLLM (Qwen2.5-0.5B, WebGPU)
│       ├── lfm3.js              # LFM3-1.7B (ONNX Runtime Web)
│       └── sgp-api.js           # SGP API (claude-qwen via proxy)
├── irp-spec/                    # Spec IRP v1.0
│   ├── schema.json              # JSON Schema formel
│   ├── intents-catalog.md       # 15 intents documentés
│   └── examples/                # 4 exemples JSON
│       ├── show_product.json
│       ├── fill_form.json
│       ├── show_pricing.json
│       └── show_chat.json
├── irp-sdk/                     # SDKs réutilisables
│   ├── irp_sdk.py               # SDK Python
│   └── irp-sdk.js               # SDK JavaScript
├── irp-extension/               # Extension navigateur Manifest V3
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── irp-renderer.js
│   ├── popup.html
│   ├── popup.js
│   └── icons/
└── irp-site/                    # Site de référence
    └── index.html               # Documentation + démo
```

### Prochaines étapes (Phase 4+)
1. **B2B Accessibilité** : exploiter la loi EU 2025 (96% sites non-compliant) — IRP génère des interfaces accessibles nativement
2. **Modèles plus performants** : LFM3-1.7B en production, Gemma-2B, Phi-3-mini
3. **IRP spec v1.1** : streaming intents, server-side rendering fallback, SEO via prerender
4. **Browser API standard** : proposer un standard W3C/WHATWG pour `application/irp+json`
5. **Marketplace d'intents** : bibliothèque d'intents réutilisables (show_product, fill_form, etc.)


---

## 17. ÉTAT ACTUEL ET DÉCISIONS (2026-11-11) — À LIRE EN PREMIER

**Pivot assumé** : l'ancien chemin « le navigateur fait générer du HTML par un LLM » reste dans le dépôt (expérimental) mais n'est plus la direction.
La direction est **IRP-Doc** : contenu = composants JSON ; rendu = code déterministe ; IA = adaptation de texte sous garde-fous.
Spécification : `irp-spec/irp-doc-v1.0.md`. Positionnement : `business/positioning.md`. Entretiens à mener : `business/interviews.md`.

### Ce qui existe (vérifié par les tests)
- `irp-core/` (source canonique, copiée par `scripts/sync-core.sh` dans `irp-extension/core`, `irp-client/core`) :
  `doc.js` (validation, `safeHref`), `render.js` (rendu + profils + thèmes WCAG), `simplify.js` (FALC par règles, lisibilité, `adaptText`/`adaptDoc` avec garde-fous),
  `extract.js` (page HTML → IRP-Doc), `verify.js` (`must_show`, `verifyPreserved`), `agent.js` (Markdown), `index.js`.
- Serveur : `irp-server/irpdoc.py` (intents → IRP-Doc, Markdown, llms.txt) ; routes `.md`, `.irpdoc.json`, `Accept`, `/llms.txt`, `/.well-known/irp.json`.
- Client web : `?mode=doc` (ou automatique si aucun moteur IA) → `irp-client/doc-mode.js`.
- Extension : `reader.js` (mode lecture, Alt+Maj+L), popup « Mode lecture adapté ».
- Sécurité : assainisseur à liste blanche pour l'ancien chemin ; proxy durci (`proxy.py`) ; plus de clé dans l'URL.
- Tests : `tests/` — 50 JS, 31 Python, e2e 27. Benchmark : `bench/` (`REPORT.md`).

### Variables d'environnement du proxy
`SGP_API_KEY` (sinon, en loopback uniquement, `~/.local/share/opencode/auth.json`), `IRP_PROXY_TOKEN` (≥ 16 car., obligatoire hors localhost), `IRP_ALLOWED_ORIGINS` (liste séparée par des virgules), `IRP_PROXY_RATE` (requêtes/min/client, défaut 30), `IRP_SGP_URL` (amont). Options serveur : `--allow-origin`, `--no-proxy`.

### Règles pour les agents qui modifient ce code
1. **Ne jamais** faire produire du HTML par un modèle dans le chemin IRP-Doc. L'IA ne reçoit/renvoie que du texte, toujours via `adaptText` (vérification obligatoire).
2. Toute modification d'`irp-core/` → `scripts/sync-core.sh`, puis `node --test` (dans `tests/`) et `python3 -m unittest discover -s tests -p "test_*.py"`.
3. Pas de caractères `\u` littéraux dans les regex écrites via un shell : construire les classes à l'exécution (voir `doc.js`).
4. Le Markdown de `agent.js` et celui d'`irpdoc.py` doivent rester identiques (test de contrat).
5. Ne pas affirmer de chiffres non mesurés (l'ancien « 50x » a été retiré). Citer `bench/REPORT.md` et ses limites.
6. Un FALC n'est **pas** certifié : toujours parler d'« aide de lecture ».

### Limites connues / prochaines étapes
- Extraction : heuristique ; mesurée sur corpus synthétique seulement → tester sur de vraies pages (`bench/README.md`).
- Pas de composant `form` dans IRP-Doc (à concevoir avec soin : actions, validation, CSRF).
- Écrans publiés non testés dans Firefox/Safari (extension MV3 testée sous Chromium headless).
- Aucune validation commerciale : mener les 5 entretiens avant d'investir davantage.

### Ajouts du 2026-11-11 (soir)
- **Outil « colle une URL »** : `irp-server/fetcher.py` (anti-SSRF, 25 tests dans `tests/test_fetcher.py`), routes `/__fetch`, `/tool`, `/tool.js`, `/core/*.js`, `/privacy` ; page `irp-site/tool.html` + `tool.js` ; CSP stricte. Ne jamais assouplir `fetcher.py` sans ajouter le test correspondant ; `allow_private`/`_plain_ports` sont **réservés aux tests**.
- **`irp-core/audit.js`** : repérage de défauts de la page source (ce n'est pas un audit RGAA).
- **`irp-reader/`** : extension minimale pour le Web Store (activeTab + scripting + storage, sans permission d'hôte). `scripts/build_reader.py` assemble `dist/irp-reader/` (reader.js vient de `irp-extension/reader.js`, core de `irp-core/`). L'ancienne `irp-extension/` est un outil de développement (interception IRP) : ne pas la publier.
- **`store/`** : fiches FR/EN, `PRIVACY.md` (crochets à compléter par l'éditeur), `CHECKLIST.md`, `screenshots/`. **`business/`** : `article.md`, `launch-kit.md`, `interviews.md` (facultatif), `positioning.md`.
- `scripts/sync-core.sh` n'efface plus rien (copie seulement).

## 18. Version de lecture aboutie (2026-11-12)

La direction produit est maintenant **IRP Lecture**, le lecteur de pages/texte/fichiers, avec IRP-Doc comme fondation. Les descriptions historiques de « frontend remplacé par l’IA » ne décrivent pas le produit courant.

- `/tool` : texte extrait inchangé par défaut, présentation configurable, sommaire, concentration, comparaison passage par passage, simplification par règles explicite, export Markdown non simplifié, export HTML autonome et impression.
- `irp-core/reading.js` : préférences bornées, parsing HTML inerte, collage texte/Markdown élémentaire, comparaison et noms de fichiers. Ne jamais mémoriser un document ou envoyer un fichier sans demande explicite de l’utilisateur.
- `adaptText` ajoute un filtre conservateur de marqueurs de négation, condition, modalité et ordre. Les contrôles ne prouvent PAS le sens ni l’exhaustivité de l’extraction ; ne plus employer « rien de perdu » ou « sortie vérifiée » comme garantie globale.
- `renderDoc` accepte `embedded`, `titleLevel` et `idPrefix` pour éviter les landmarks et identifiants dupliqués. `visibleText` sépare les blocs et cellules lors du contrôle.
- `start.sh` démarre un serveur local sans proxy IA, refuse un port occupé et ne tue aucun processus. `--port` et `--no-open` sont disponibles.
- Extension minimale version 1.3.0 : texte extrait, export HTML, contrôle du focus et badge honnête sur les heuristiques. Les assemblages recopient sans supprimer les dossiers existants.
- Tests : `npm ci --prefix tests`, `(cd tests && npx playwright install chromium)`, `npm run --prefix tests test:browser`. Le runner lance ses serveurs, teste quatre pages publiques et charge le vrai paquet MV3 dans un profil temporaire Chromium. Les sorties sont dans `docs/validation-results.json` et `docs/screenshots/`.
- Bilan vérifié : `docs/VALIDATION.md`. Aucun déploiement public, publication Web Store ou test utilisateur de compréhension n’est impliqué par ces résultats.
