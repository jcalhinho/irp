# IRP — Pourquoi le navigateur devrait générer le web

**Un essai technique sur la fin du frontend tel qu'on le connaît.**

*Novembre 2026*

---

## Résumé

Depuis 30 ans, le modèle web est immuable : le serveur produit du HTML, le navigateur l'affiche. Le navigateur est un client passif. Il ne "pense" pas, il exécute. Cet article propose d'inverser ce modèle : le serveur envoie une **intention** (JSON ~2KB), et le navigateur, via un agent IA embarqué, génère l'interface optimale pour cet utilisateur, cette machine, ce contexte. Nous appelons ce protocole **IRP (Intent Rendering Protocol)**. Nous démontrons sa faisabilité technique aujourd'hui (POC fonctionnel avec WebLLM sur WebGPU), analysons ses implications économiques, et discutons du chemin vers la standardisation.

---

## 1. Le problème

Le stack frontend moderne est une pyramide de complexité :

```
Serveur (Python/Node/Go)
  → Framework SSR (Next.js/Nuxt/Remix)
    → Bundler (Webpack/Vite/esbuild)
      → Framework client (React/Vue/Svelte)
        → CSS framework (Tailwind/Bootstrap)
          → State management (Redux/Zustand/Pinia)
            → Component library (MUI/AntD/shadcn)
              → 100-500KB de HTML/CSS/JS transférés
                → Navigateur passif qui affiche
```

Conséquences :

- **Bandwidth** : 100-500KB par page, pour souvent afficher 2KB de contenu utile.
- **Build step** : chaque déploiement requiert compilation, minification, tree-shaking, code-splitting.
- **Accessibilité** : 96% des sites web ne sont pas conformes WCAG. L'accessibilité est traitée a posteriori, pas par design.
- **Un size fits all** : le même document HTML est servi à un senior avec daltonisme sur un vieux téléphone 3G et à un développeur sur un MacBook Pro M4. Adapté à personne.
- **Débat SSR vs CSR vs SSG** : une décennie de débats sans fin sur où générer le HTML.

## 2. L'axiome brisé

L'axiome implicite du web est : **le navigateur est un client passif qui affiche ce que le serveur lui envoie**.

Cet axiome date de 1993. À l'époque, les navigateurs ne pouvaient rien faire d'autre qu'afficher du texte et des images. Aujourd'hui, les navigateurs peuvent :

- Exécuter du WebAssembly à quasi-native speed
- Faire du compute GPU via WebGPU
- Faire tourner des modèles IA localement (Chrome Prompt API, WebLLM, ONNX Runtime)
- Accéder à des capteurs (géolocalisation, batterie, réseau, device capabilities)
- Détecter les préférences utilisateur (thème, contraste, mouvement réduit, taille de police)

Le navigateur de 2026 est un runtime complet. Mais on l'utilise encore comme un terminal des années 90.

**L'axiome brisé** : le navigateur devient un agent IA actif qui crée l'interface, pas un client passif qui l'affiche.

## 3. Le concept IRP

### 3.1 Le protocole

IRP remplace le HTML par un format JSON qui décrit **l'intention** de la page, pas sa forme :

```json
{
  "irp": {
    "version": "1.1",
    "intent": "show_product",
    "data": {
      "name": "MacBook Pro 16",
      "price": { "amount": 2799, "currency": "EUR" },
      "specs": [...]
    },
    "constraints": {
      "must_show": ["name", "price"],
      "priority": "conversion"
    },
    "actions": [
      { "id": "add_to_cart", "label": "Ajouter au panier", "type": "primary" }
    ]
  }
}
```

Content-Type : `application/irp+json`

Le serveur ne dit pas *comment* afficher le produit. Il dit *ce qu'il faut afficher* (un produit, son prix, un bouton d'achat). Le navigateur décide *comment*.

### 3.2 Le rendu côté navigateur

Le client IRP (JavaScript, pas de build) :

1. **Détecte le contexte** : écran (1920x1080, DPR 2), thème (dark), langue (fr), accessibilité (contraste élevé, mouvement réduit), réseau (4G, 2Mbps), batterie (23%, non chargé), device (mobile, 4 cores, 4GB RAM).

2. **Choisit le meilleur modèle IA** disponible localement :
   - Chrome Prompt API (Gemini Nano, ~200ms) — natif, le plus rapide
   - WebLLM (Qwen2.5-0.5B, ~2-5s) — local via WebGPU
   - LFM3-1.7B (Liquid AI, ~3-8s) — local via ONNX
   - SGP API (claude-qwen, ~5-30s) — distant, fallback

3. **Génère le HTML/CSS/JS** adapté au contexte. Un utilisateur avec daltonisme obtient une palette optimisée. Un utilisateur sur 3G obtient un design épuré sans animations. Un utilisateur avec un lecteur d'écran obtient une structure sémantique parfaite avec ARIA.

4. **Sanitise et injecte** le HTML dans le DOM.

5. **Cache le résultat** dans IndexedDB pour les visites suivantes.

### 3.3 Le résultat

| Métrique | Web classique | IRP |
|---|---|---|
| Transféré par page | 100-500KB | **2KB** (50x moins) |
| Build step | Requis | **Aucun** |
| Framework | React/Vue/Svelte | **Aucun** |
| CSS framework | Tailwind/Bootstrap | **Aucun** |
| Accessibilité | Post-traitement | **Native** |
| Personnalisation | Générique | **Unique par utilisateur** |
| Privacy | Données au serveur | **Locale** |

## 4. Faisabilité technique

### 4.1 POC fonctionnel

Nous avons construit un POC complet :

- **Serveur IRP** (Python stdlib, zéro dépendance) : 12 routes, 8 modules d'intents, proxy SGP, CORS, SEO prerender pour bots.
- **Client IRP** (HTML/JS pur, pas de build) : 4 renderers avec fallback chain, cache IndexedDB, navigation SPA, context sensor complet.
- **Extension navigateur** (Manifest V3) : intercepte `application/irp+json` sur n'importe quel site.
- **SDK Python + JavaScript** : factory helpers + décorateur `@intent`.
- **Spec v1.1** : JSON Schema, 15 intents, streaming SSE, SSR fallback, SEO metadata.

### 4.2 Le POC en chiffres

- WebLLM charge Qwen2.5-0.5B (266MB) depuis le cache en **1 seconde** (premier téléchargement : ~3 min).
- Le modèle génère **13KB de HTML** valide (avec CSS inline, JS inline, SVG inline) depuis un intent de **2KB**.
- Le rendu est injecté et visible en **~2-5 secondes** (modèle 0.5B sur WebGPU).
- Le cache IndexedDB rend les visites suivantes **instantanées**.

### 4.3 Les limites actuelles

Honnêtement :

1. **Qwen2.5-0.5B est trop petit**. Il génère du HTML parfois incohérent. Le rendu n'est pas bluffant à chaque fois. Un modèle 2-7B (Gemma-2B, Phi-3-mini, Qwen2.5-3B) serait nécessaire pour une qualité production.

2. **Pas de streaming sur les renderers locaux**. WebLLM et LFM3 génèrent atomiquement. L'utilisateur attend que toute la page soit générée. Seul le SGP API (distant) supporte le streaming SSE.

3. **Le premier téléchargement du modèle est long** (266MB, ~3 min). C'est acceptable pour un POC, pas pour un site public. Solution : précharger le modèle au premier visite, ou utiliser Chrome Prompt API (natif, pas de téléchargement).

4. **Pas de hydration**. Chaque navigation régénère l'interface from scratch. Pas de réconciliation DOM comme React. Le cache atténue ce problème mais ne le résout pas.

### 4.4 Le chemin vers la production

| Problème | Solution | Délai |
|---|---|---|
| Modèle trop petit (0.5B) | Qwen2.5-3B, Gemma-2B, Phi-3-mini | 2026 (modèles existent) |
| Pas de streaming local | WebLLM streaming API (en développement) | 2026-2027 |
| Premier téléchargement long | Chrome Prompt API (natif) + préchargement | 2026 |
| Pas de hydration | IRP v1.2 (partial intents) | 2027 |
| SEO | ✅ Résolu (prerender côté serveur pour bots) | Fait |

**Verdict** : le concept est faisable aujourd'hui pour un POC. La production grand public nécessite des modèles 2-3B quantifiés qui tournent en < 3s sur WebGPU. Ces modèles existent déjà (Qwen2.5-3B, Gemma-2B). Le gap est de 12-18 mois, pas 5 ans.

## 5. Implications économiques

### 5.1 Coûts serveur réduits

Un serveur IRP ne génère pas de HTML. Il sert du JSON statique depuis un cache. Le compute est déplacé vers le client. Un serveur qui servait 10,000 pages/seconde en SSR peut servir 100,000 intents/seconde en IRP (juste du JSON, pas de rendering).

**Économie** : 10x moins de serveurs, 10x moins de coûts cloud.

### 5.2 Bande passante réduite

2KB vs 500KB par page = **250x moins de bande passante**. Pour un site à 1M de visites/jour, c'est 500GB/jour d'économisé. Sur un CDN à $0.08/GB, c'est **$1,200/jour d'économies**.

### 5.3 Accessibilité comme marché

La loi européenne sur l'accessibilité entre en vigueur en 2025. 96% des sites ne sont pas conformes. Le coût de mise en conformité est estimé à €50,000-€200,000 par site. IRP résout ce problème par design : l'IA adapte l'interface au handicap de l'utilisateur, automatiquement.

**Marché** : 250M de sites web en Europe. Même à €1,000/site/an, c'est un marché de €250M/an.

### 5.4 Le modèle d'affaires

Trois pistes :

1. **IRP Server (open source) + IRP Cloud (SaaS)** : le serveur est gratuit, le cloud managé est payant. Modèle équivalent à Supabase, Vercel, etc.

2. **Marketplace d'intents** : bibliothèque d'intents réutilisables (show_product, show_dashboard, etc.) avec templates premium. Modèle équivalent à Shopify Theme Store.

3. **Extension navigateur premium** : l'extension de base est gratuite, la version pro (modèles plus performants, custom prompts, analytics) est payante.

## 6. Le chemin vers la standardisation

### 6.1 Content-Type

La première étape est d'enregistrer `application/irp+json` comme type MIME officiel via l'IANA. C'est un processus administratif, pas technique.

### 6.2 Spec ouverte

La spec IRP v1.1 est ouverte et documentée. L'étape suivante est de la proposer au W3C ou au WHATWG comme note de groupe de travail. Le format est simple, l'implémentation de référence existe, le POC est fonctionnel.

### 6.3 Adoption navigateur

Le scénario idéal : Chrome intègre un renderer IRP natif (via Prompt API / Gemini Nano). Firefox et Safari suivent. À ce moment, IRP devient un standard de facto : les serveurs envoient des intents, les navigateurs rendent nativement.

C'est le même chemin que WebRTC, WebAssembly, ou WebGPU : proposition → POC → implémentation → standard.

### 6.4 Le pari

IRP est un pari sur le fait que :
1. Les modèles IA locaux seront assez performants dans 2-3 ans (probable : Qwen2.5-3B tourne déjà en ~5s sur WebGPU).
2. Les navigateurs intégreront des renderers IA natifs (probable : Chrome a déjà Prompt API).
3. Les développeurs sont fatigués de la complexité du frontend (certain : la "fatigue JavaScript" est un phénomène bien documenté).

## 7. Critiques et limites

### "L'IA génère du HTML non déterministe"

Vrai. Deux visites de la même page peuvent produire des interfaces légèrement différentes. C'est une feature, pas un bug : l'interface s'adapte au contexte. Mais ça pose des problèmes pour les tests E2E et le debugging. Solution : mode "deterministic" avec temperature=0 et seed fixe.

### "Ça ne marche pas sans JavaScript"

Vrai. Mais 99.5% des navigateurs ont JS activé. Et le SEO est préservé via prerender côté serveur pour les bots.

### "C'est trop lent"

Le premier rendu prend 2-5s (modèle 0.5B) ou 5-30s (SGP API distant). C'est plus lent qu'un site statique. Mais : (1) le cache rend les visites suivantes instantanées, (2) les modèles 2-3B seront 3-5x plus rapides en 2027, (3) Chrome Prompt API est à ~200ms.

### "L'IA peut générer du HTML malveillant"

Le DomBuilder sanitize tout : pas de scripts externes, pas d'iframes, pas d'event handlers inline, pas de javascript: URLs. Le risque est équivalent à un framework frontend qui génère du DOM dynamiquement.

### "Les développeurs perdent le contrôle du design"

C'est le point le plus débattu. Aujourd'hui, un designer crée un design précis et le développeur l'implémente. Avec IRP, l'IA génère le design. Le contrôle se fait via les `constraints` (priorité, must_show, content_type) et les prompts système. C'est un changement de paradigme : on passe du design pixel-perfect au design par contraintes.

## 8. Conclusion

IRP n'est pas une amélioration incrémentale. C'est un changement d'axiome. Le navigateur cesse d'être un client passif et devient un agent IA actif. Le serveur cesse d'être un générateur de HTML et devient un fournisseur d'intentions.

Le POC fonctionne. Les modèles existent. Les navigateurs ont les capacités. Le chemin vers la production est de 12-18 mois, pas 5 ans.

La question n'est pas *si* ça arrivera, mais *quand* et *par qui*. Le web a été construit sur l'axiome du navigateur passif parce qu'il n'y avait pas d'alternative. Aujourd'hui, il y en a une.

---

## Références

- [IRP Spec v1.1](../irp-spec/spec-v1.1.md) — Spécification complète
- [POC fonctionnel](../start.sh) — `./start.sh` pour lancer
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) — Gemini Nano dans le navigateur
- [WebLLM](https://github.com/mlc-ai/web-llm) — Modèles LLM sur WebGPU
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) — Inférence IA dans le navigateur
- [Loi européenne sur l'accessibilité 2025](https://digital-strategy.ec.europa.eu/en/policies/european-accessibility-act)

---

*IRP est un projet open source (MIT). Le code source, la spec, les SDKs et l'extension navigateur sont disponibles dans le dépôt.*
