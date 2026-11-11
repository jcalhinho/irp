/**
 * IRP SDK JavaScript — Client réutilisable pour intégrer IRP dans n'importe quel site.
 *
 * Usage:
 *   import { IRPClient } from './irp-sdk.js';
 *
 *   const client = new IRPClient({
 *     server: 'http://localhost:8001',
 *     proxyUrl: 'http://localhost:8001/__proxy/sgp',
 *     mount: '#app',           // sélecteur CSS où injecter le DOM
 *   });
 *
 *   await client.init();        // détecte les renderers disponibles
 *   await client.navigate('/'); // fetch IRP + rendu
 *
 * Sécurité : le HTML généré par l'IA est NON FIABLE ; il est assaini par liste blanche
 * (irp-sanitizer.js, importé ci-dessous) avant injection. Aucun script n'est exécuté.
 * Aucune clé API côté navigateur : le proxy serveur la détient (jeton optionnel : proxyToken).
 */

import './irp-sanitizer.js'; // définit globalThis.IRPSanitizer

// ─── IRPResponse ─────────────────────────────────────────────────────────────

class IRPResponse {
  constructor(data) {
    if (!data?.irp) throw new Error('Réponse IRP invalide: champ "irp" manquant');
    const irp = data.irp;
    this.version = irp.version || '1.0';
    this.intent = irp.intent;
    this.data = irp.data || {};
    this.constraints = irp.constraints || {};
    this.actions = irp.actions || [];
    this.contextHints = irp.context_hints || {};
    this.metadata = irp.metadata || {};
  }

  get cacheable() { return this.contextHints.cacheable !== false; }
  get ttl() { return this.contextHints.ttl ?? 3600; }
  get etag() { return this.contextHints.etag || null; }
  get requiresAuth() { return this.contextHints.requires_auth || false; }
}

// ─── ContextSensor ───────────────────────────────────────────────────────────

class ContextSensor {
  static detect() {
    const mq = window.matchMedia;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dpr: window.devicePixelRatio || 1,
      theme: mq?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      contrast: mq?.('(prefers-contrast: more)').matches ? 'high' : 'normal',
      reducedMotion: mq?.('(prefers-reduced-motion: reduce)').matches || false,
      fontSize: mq?.('(prefers-reduced-data: reduce)').matches ? 'large' : 'normal',
      lang: navigator.language || 'en',
      online: navigator.onLine,
      connection: navigator.connection?.effectiveType || 'unknown',
      saveData: navigator.connection?.saveData || false,
      touch: 'ontouchstart' in window,
      platform: navigator.platform || 'unknown',
    };
  }

  static fingerprint() {
    const ctx = ContextSensor.detect();
    return [
      ctx.viewport.width < 768 ? 'mobile' : ctx.viewport.width < 1024 ? 'tablet' : 'desktop',
      ctx.theme,
      ctx.lang,
      ctx.reducedMotion ? 'rm' : '',
      ctx.contrast === 'high' ? 'hc' : '',
    ].filter(Boolean).join(':');
  }
}

// ─── Cache (IndexedDB) ───────────────────────────────────────────────────────

class IRPCache {
  constructor(dbName = 'irp-cache') {
    this.dbName = dbName;
    this._db = null;
  }

  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('renders')) {
          db.createObjectStore('renders', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  }

  async get(key) {
    try {
      const db = await this._open();
      return new Promise((resolve) => {
        const tx = db.transaction('renders', 'readonly');
        const store = tx.objectStore('renders');
        const req = store.get(key);
        req.onsuccess = () => {
          const result = req.result;
          if (!result) return resolve(null);
          if (Date.now() - result.timestamp > result.ttl * 1000) {
            this.delete(key);
            return resolve(null);
          }
          resolve(result.html);
        };
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async set(key, html, ttl = 3600) {
    try {
      const db = await this._open();
      return new Promise((resolve) => {
        const tx = db.transaction('renders', 'readwrite');
        tx.objectStore('renders').put({ key, html, ttl, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch { return false; }
  }

  async delete(key) {
    try {
      const db = await this._open();
      const tx = db.transaction('renders', 'readwrite');
      tx.objectStore('renders').delete(key);
    } catch {}
  }

  async clear() {
    try {
      const db = await this._open();
      const tx = db.transaction('renders', 'readwrite');
      tx.objectStore('renders').clear();
    } catch {}
  }
}

// ─── Renderers ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP (Intent Rendering Protocol).
Tu reçois un intent, des données, et le contexte utilisateur.
Tu DOIS générer UNIQUEMENT du HTML5 valide avec CSS inline (<style>), SANS JavaScript (ni <script> ni attributs on*).
Pas de markdown, pas d'explication, pas de ressources externes.
Le HTML sera injecté dans un div#irp-root.
Design moderne, responsive, accessible.
Utilise des SVG inline pour les icônes et images.
Adapte le design au contexte (dark/light, mobile/desktop, reduced motion, etc.).`;

class ChromeAPIRenderer {
  get name() { return 'Chrome Prompt API (Gemini Nano)'; }

  async isAvailable() {
    if (!window.ai?.languageModel) return false;
    try {
      const avail = await window.ai.languageModel.availability();
      return avail === 'available' || avail === 'downloadable';
    } catch { return false; }
  }

  async render(irp, context) {
    const session = await window.ai.languageModel.create({
      systemPrompt: SYSTEM_PROMPT,
      initialPrompts: [{ role: 'user', content: this._prompt(irp, context) }],
    });
    const result = await session.prompt(this._prompt(irp, context));
    session.destroy();
    return this._clean(result);
  }

  _prompt(irp, ctx) {
    return `Intent: ${irp.intent}\nData: ${JSON.stringify(irp.data)}\nConstraints: ${JSON.stringify(irp.constraints)}\nContext: ${JSON.stringify(ctx)}\nGénère le HTML.`;
  }

  _clean(html) {
    let h = html.trim();
    if (h.startsWith('```')) {
      const lines = h.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      h = lines.join('\n').trim();
    }
    return h.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
  }
}

class WebLLMRenderer {
  get name() { return 'WebLLM (Qwen2.5-0.5B)'; }
  _engine = null;

  async isAvailable() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  async render(irp, context) {
    if (!this._engine) {
      const { CreateWebMLLMEngine } = await import('https://esm.run/@mlc-ai/web-llm');
      this._engine = await CreateWebMLLMEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', {
        initProgressCallback: (p) => console.log('[WebLLM]', p.text),
      });
    }
    const reply = await this._engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Intent: ${irp.intent}\nData: ${JSON.stringify(irp.data)}\nConstraints: ${JSON.stringify(irp.constraints)}\nContext: ${JSON.stringify(context)}\nGénère le HTML.` },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });
    return this._clean(reply.choices[0].message.content);
  }

  _clean(html) {
    let h = html.trim();
    if (h.startsWith('```')) {
      const lines = h.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      h = lines.join('\n').trim();
    }
    return h.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
  }
}

class SGPAPIRenderer {
  get name() { return 'SGP API (claude-qwen)'; }
  _proxyUrl = null;

  _token = '';

  constructor(proxyUrl, token = '') { this._proxyUrl = proxyUrl; this._token = token || ''; }

  async isAvailable() { return !!this._proxyUrl; }

  async render(irp, context) {
    const body = JSON.stringify({
      model: 'claude-qwen',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Intent: ${irp.intent}\nData: ${JSON.stringify(irp.data, null, 2)}\nConstraints: ${JSON.stringify(irp.constraints)}\nContext: ${JSON.stringify(context)}\nGénère le HTML optimal.` },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    });
    const resp = await fetch(this._proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this._token ? { 'X-IRP-Token': this._token } : {}) },
      body,
    });
    if (!resp.ok) throw new Error(`SGP API Error ${resp.status}`);
    const data = await resp.json();
    return this._clean(data.choices[0].message.content);
  }

  _clean(html) {
    let h = html.trim();
    if (h.startsWith('```')) {
      const lines = h.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      h = lines.join('\n').trim();
    }
    return h.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
  }
}

// ─── IRPClient ───────────────────────────────────────────────────────────────

class IRPClient {
  constructor(options = {}) {
    this.server = options.server || 'http://localhost:8001';
    this.proxyUrl = options.proxyUrl || `${this.server}/__proxy/sgp`;
    this.mount = options.mount || '#irp-root';
    this.proxyToken = options.proxyToken || null; // jeton du proxy (optionnel) — jamais de clé API ici
    this.onLoading = options.onLoading || ((msg) => console.log('[IRP]', msg));
    this.onError = options.onError || ((err) => console.error('[IRP]', err));
    this.onRender = options.onRender || (() => {});

    this._renderers = [];
    this._cache = new IRPCache();
    this._initialized = false;
    this._currentPath = null;
  }

  async init() {
    if (this._initialized) return;

    // Détecter les renderers dans l'ordre de priorité
    const candidates = [
      new ChromeAPIRenderer(),
      new WebLLMRenderer(),
      new SGPAPIRenderer(this.proxyUrl, this.proxyToken),
    ];

    for (const r of candidates) {
      try {
        if (await r.isAvailable()) {
          this._renderers.push(r);
          console.log(`[IRP] ✅ ${r.name} disponible`);
        }
      } catch (e) {
        console.log(`[IRP] ⬚ ${r.name} non disponible`);
      }
    }

    if (this._renderers.length === 0) {
      throw new Error('Aucun renderer IA disponible');
    }

    console.log(`[IRP] ${this._renderers.length} renderer(s): ${this._renderers.map(r => r.name).join(', ')}`);
    this._initialized = true;
  }

  async navigate(path) {
    this._currentPath = path;

    // 1. Détecter le contexte
    const context = ContextSensor.detect();
    const fingerprint = ContextSensor.fingerprint();

    // 2. Vérifier le cache
    const cacheKey = `${path}:${fingerprint}`;
    if (this._cache) {
      const cached = await this._cache.get(cacheKey);
      if (cached) {
        this._inject(cached);
        this.onRender({ source: 'cache', path });
        return;
      }
    }

    // 3. Fetch l'IRP
    this.onLoading('Chargement…');
    const resp = await fetch(`${this.server}${path}`, {
      headers: { 'Accept': 'application/irp+json', 'X-IRP-Context': JSON.stringify(context) },
    });

    if (!resp.ok) {
      // Essayer de récupérer un IRP d'erreur
      try {
        const errData = await resp.json();
        const errIrp = new IRPResponse(errData);
        await this._render(errIrp, context, cacheKey);
        return;
      } catch {
        throw new Error(`HTTP ${resp.status}`);
      }
    }

    const data = await resp.json();
    const irp = new IRPResponse(data);

    // 4. Rendre via le meilleur renderer disponible
    await this._render(irp, context, cacheKey);
  }

  async _render(irp, context, cacheKey) {
    let lastError = null;

    for (const renderer of this._renderers) {
      try {
        this.onLoading(`Génération via ${renderer.name}…`);
        console.log(`[IRP] Essai: ${renderer.name}`);
        const html = await renderer.render(irp, context);

        if (html && html.length > 50) {
          this._inject(html);

          // Cacher le résultat
          if (irp.cacheable && this._cache) {
            await this._cache.set(cacheKey, html, irp.ttl);
          }

          this.onRender({ source: renderer.name, path: this._currentPath, htmlLength: html.length });
          return;
        }
      } catch (e) {
        console.warn(`[IRP] ❌ ${renderer.name} a échoué: ${e.message}`);
        lastError = e;
      }
    }

    throw lastError || new Error('Tous les renderers ont échoué');
  }

  _inject(html) {
    const mount = document.querySelector(this.mount);
    if (!mount) throw new Error(`Mount point "${this.mount}" introuvable`);
    if (!globalThis.IRPSanitizer) throw new Error('IRPSanitizer introuvable : rendu refusé (échec sécurisé)');
    globalThis.IRPSanitizer.mount(mount, html); // assaini, aucun script exécuté
  }

  async clearCache() {
    await this._cache.clear();
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

// ESM
export { IRPClient, IRPResponse, ContextSensor, IRPCache,
         ChromeAPIRenderer, WebLLMRenderer, SGPAPIRenderer, SYSTEM_PROMPT };

// UMD (pour <script src="irp-sdk.js">)
if (typeof window !== 'undefined') {
  window.IRP = {
    create: (opts) => new IRPClient(opts),
    IRPClient,
    IRPResponse,
    ContextSensor,
    IRPCache,
  };
}
