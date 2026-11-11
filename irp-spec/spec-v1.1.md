# IRP Specification v1.1

**Intent Rendering Protocol — Specification v1.1**
November 2026

This document specifies IRP v1.1, an evolution of v1.0 that adds:
- **Streaming intents** — progressive rendering during generation
- **SSR fallback** — server-side rendering for bots and legacy clients
- **SEO metadata** — structured data for search engines
- **Intent actions** — declarative interactive elements
- **Context negotiation** — client sends context hints to server

---

## 1. Content-Type

```
Content-Type: application/irp+json; charset=utf-8
```

For streaming responses (v1.1):

```
Content-Type: text/event-stream
```

Each SSE event carries a partial IRP or rendering chunk.

---

## 2. IRP Document Structure

```json
{
  "irp": {
    "version": "1.1",
    "intent": "show_product",
    "data": { ... },
    "constraints": {
      "must_show": ["name", "price"],
      "priority": "conversion",
      "content_type": "commercial"
    },
    "context_hints": {
      "cacheable": true,
      "ttl": 3600,
      "streamable": true
    },
    "actions": [
      {
        "id": "add_to_cart",
        "label": "Ajouter au panier",
        "type": "primary",
        "href": "/cart/add/123",
        "method": "POST",
        "payload": { "product_id": "123", "quantity": 1 }
      }
    ],
    "metadata": {
      "title": "MacBook Pro 16 — 2799€",
      "description": "Le MacBook Pro 16 pouces avec la puce M4 Max...",
      "lang": "fr",
      "og_type": "product",
      "canonical_url": "https://example.com/product/macbook-pro-16"
    },
    "seo": {
      "prerender": true,
      "json_ld": {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "MacBook Pro 16",
        "offers": {
          "@type": "Offer",
          "price": "2799",
          "priceCurrency": "EUR"
        }
      }
    }
  }
}
```

### 2.1 Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | ✅ | Protocol version (`"1.0"` or `"1.1"`) |
| `intent` | string | ✅ | The rendering intent (see [Intent Catalog](#3-intent-catalog)) |
| `data` | object | ✅ | The data to render |
| `constraints` | object | ❌ | Rendering constraints (priority, must_show, content_type) |
| `context_hints` | object | ❌ | Caching and streaming hints |
| `actions` | array | ❌ | Declarative interactive elements (v1.1) |
| `metadata` | object | ❌ | SEO and social metadata (v1.1) |
| `seo` | object | ❌ | Server-side rendering hints (v1.1) |

### 2.2 New in v1.1

#### `actions` (v1.1)

Declarative interactive elements that the renderer MUST include in the generated UI.

```json
"actions": [
  {
    "id": "add_to_cart",
    "label": "Ajouter au panier",
    "type": "primary",
    "href": "/cart/add/123",
    "method": "POST",
    "payload": { "product_id": "123", "quantity": 1 }
  },
  {
    "id": "favorite",
    "label": "Favoris",
    "type": "secondary",
    "href": "/favorites/toggle/123",
    "method": "POST"
  }
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique action identifier |
| `label` | string | ✅ | Button/link label |
| `type` | string | ❌ | `primary`, `secondary`, `danger` (default: `secondary`) |
| `href` | string | ❌ | URL for navigation or API call |
| `method` | string | ❌ | HTTP method (`GET`, `POST`, `PUT`, `DELETE`) |
| `payload` | object | ❌ | Request body for POST/PUT |

#### `metadata` (v1.1)

SEO and social metadata. Used by the server for prerendering and by the client for `document.title`.

```json
"metadata": {
  "title": "MacBook Pro 16 — 2799€",
  "description": "Le MacBook Pro 16 pouces avec la puce M4 Max...",
  "lang": "fr",
  "og_type": "product",
  "canonical_url": "https://example.com/product/macbook-pro-16"
}
```

#### `seo` (v1.1)

Server-side rendering configuration. When `prerender` is `true`, the server SHOULD generate static HTML for bots.

```json
"seo": {
  "prerender": true,
  "json_ld": {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "MacBook Pro 16",
    "offers": { ... }
  }
}
```

#### `context_hints.streamable` (v1.1)

When `true`, the client MAY request a streaming response. The server SHOULD support SSE streaming for this intent.

---

## 3. Intent Catalog

### Core intents (v1.0)

| Intent | Description | Data shape |
|---|---|---|
| `show_landing` | Marketing landing page | `{ title, tagline, description, features[], links[] }` |
| `show_product` | E-commerce product page | `{ name, price{amount,currency}, specs[], description, badges[] }` |
| `show_catalog` | Product catalog with filters | `{ title, products[], filters[] }` |
| `read_article` | Blog/article page | `{ title, author, date, read_time, excerpt, content }` |
| `fill_form` | Form (contact, signup, etc.) | `{ title, description, fields[] }` |
| `show_dashboard` | Analytics dashboard | `{ title, kpis[], charts[] }` |
| `browse_list` | List of items (tasks, favorites) | `{ title, items[] }` |
| `show_pricing` | Pricing table | `{ title, plans[] }` |
| `show_chat` | Chat interface | `{ title, messages[] }` |
| `show_error` | Error page (404, 500, etc.) | `{ status, message, links[] }` |

### Extended intents (v1.1)

| Intent | Description | Data shape |
|---|---|---|
| `show_profile` | User profile page | `{ name, bio, avatar, stats{}, tabs[] }` |
| `show_search` | Search results page | `{ query, results[], facets[] }` |
| `play_media` | Media player (video/audio) | `{ title, artist, duration, source }` |
| `show_map` | Map interface | `{ center, zoom, markers[] }` |
| `show_docs` | Technical documentation | `{ title, sections[], toc[] }` |

---

## 4. Context Negotiation (v1.1)

The client SHOULD send context hints to the server via the `X-IRP-Context` header:

```
X-IRP-Context: {"device":"desktop","theme":"dark","lang":"fr","viewport":"1920x1080"}
```

The server MAY use this to:
- Adjust the data returned (e.g., fewer items for mobile)
- Set the `metadata.lang` field
- Adjust `context_hints.ttl` based on device

---

## 5. Streaming Protocol (v1.1)

### Request

The client requests streaming by sending:

```
Accept: text/event-stream
X-IRP-Context: {...}
```

### Response

The server responds with `Content-Type: text/event-stream` and sends Server-Sent Events:

```
event: irp
data: {"irp":{"version":"1.1","intent":"show_product","data":{...}}}

event: chunk
data: {"delta":"<style>.card{background:#0a0a14;...</style>"}

event: chunk
data: {"delta":"<section class=\"product\"><h1>MacBook Pro 16</h1>"}

event: chunk
data: {"delta":"<p class=\"price\">2799 €</p></section>"}

event: done
data: {"renderer":"SGP API (claude-qwen)","bytes":4523}
```

### Events

| Event | Description |
|---|---|
| `irp` | The full IRP document (sent first) |
| `chunk` | A rendering delta (HTML fragment) |
| `done` | Rendering complete (includes metadata) |
| `error` | Rendering failed (includes error message) |

---

## 6. SSR Fallback (v1.1)

### Bot Detection

The server detects bots via User-Agent and serves prerendered HTML:

```
User-Agent: Googlebot/2.1
→ Content-Type: text/html
→ X-IRP-Prerendered: true
```

### Prerendered HTML

The prerendered HTML MUST include:
- `<!DOCTYPE html>` and `<html lang="...">`
- `<title>` and `<meta name="description">`
- Open Graph tags (`og:title`, `og:description`, `og:type`)
- Twitter Card tags
- JSON-LD structured data (`<script type="application/ld+json">`)
- Semantic HTML content (h1, h2, p, ul, table)
- Internal links (`<a href="...">`)

### Legacy Client Fallback

Clients that don't support `application/irp+json` (no IRP client) receive the same prerendered HTML. This is detected via:

```
Accept: text/html  (no application/irp+json)
→ Serve prerendered HTML
```

---

## 7. Caching (v1.0 + v1.1)

### Client-side cache

The client caches rendered HTML in IndexedDB. The cache key is based on:
- Path
- Intent
- Data ID
- Context fingerprint (theme, lang, device, viewport, a11y)

### Cache invalidation

- TTL-based (default: 3600s, configurable via `context_hints.ttl`)
- Manual invalidation via `irpCache.clear()`
- Version-based: if `irp.version` changes, cache is invalidated

### Server-side cache (v1.1)

The server MAY cache:
- Prerendered HTML for bots (keyed by path + bot type)
- IRP responses (keyed by path + context)

---

## 8. Model Router (v1.0 + v1.1)

### Fallback chain

```
1. Chrome Prompt API     → ~200ms  (native, fastest)
2. WebLLM (Qwen2.5-0.5B) → ~2-5s   (local, WebGPU)
3. LFM3-1.7B             → ~3-8s   (local, ONNX)
4. SGP API (claude-qwen) → ~5-30s  (remote, highest quality)
```

### Selection logic (v1.1)

| Condition | Preferred renderer |
|---|---|
| Offline | Chrome API → WebLLM → LFM3 (local only) |
| Complex intent (dashboard, catalog, form) | SGP API (quality) |
| Low-end device (RAM < 4GB, cores < 4) | SGP API (no local compute) |
| Default | Chrome API → WebLLM → LFM3 → SGP |

### Streaming support (v1.1)

| Renderer | Streaming | Notes |
|---|---|---|
| Chrome Prompt API | ❌ | Not supported |
| WebLLM | ❌ | Not supported (generation is atomic) |
| LFM3 | ❌ | Not supported |
| SGP API | ✅ | SSE streaming via proxy |

---

## 9. Security

### HTML Sanitization

The client MUST sanitize all generated HTML before injection:
- Remove `<iframe>`, `<object>`, `<embed>`
- Remove `<script src="...">` (external scripts)
- Remove `<link rel="stylesheet">` (external CSS)
- Remove inline event handlers (`onclick`, `onload`, etc.)
- Remove `javascript:` URLs
- Replace external `<img src="http...">` with placeholders

### Proxy Security

The SGP proxy MUST:
- Only forward to the configured SGP API endpoint
- Not expose the API key to the client
- Rate-limit requests (recommended: 10 req/min per IP)

---

## 10. Versioning

- v1.0 — Initial protocol (intent, data, constraints, context_hints)
- v1.1 — Added actions, metadata, seo, streaming, context negotiation
- v1.2 (planned) — Partial intents (stream data + render progressively), SSR hydration

Clients MUST check `irp.version` and handle unknown versions gracefully.

---

## 11. Content-Type Negotiation

```
Client sends:
  Accept: application/irp+json          → Server returns IRP JSON
  Accept: text/event-stream             → Server returns SSE stream (v1.1)
  Accept: text/html                     → Server returns prerendered HTML (v1.1)
  Accept: */*                           → Server returns IRP JSON (default)

Bot User-Agent + any Accept             → Server returns prerendered HTML (v1.1)
```

---

## References

- [IRP v1.0 Schema](schema.json) — JSON Schema (draft 2020-12)
- [Intent Catalog](intents-catalog.md) — 15 intents documented
- [Examples](examples/) — 4 example IRP documents
- [IRP SDK Python](../irp-sdk/irp_sdk.py) — Python SDK
- [IRP SDK JavaScript](../irp-sdk/irp-sdk.js) — JavaScript SDK
