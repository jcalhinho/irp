// irp-renderer.js — Script injecté dans la page par l'extension IRP
// Patche fetch() et XMLHttpRequest pour intercepter les réponses application/irp+json
// et génère le DOM localement via les renderers IA disponibles

(function () {
  'use strict';

  // Éviter la double-injection
  if (window.__irpRendererInjected) return;
  window.__irpRendererInjected = true;

  let enabled = true;

  // ─── Système prompt pour les renderers ──────────────────────────────────────

  const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP (Intent Rendering Protocol).
Tu reçois un intent, des données, et le contexte utilisateur.
Tu DOIS générer UNIQUEMENT du HTML5 valide avec CSS inline (<style>), SANS JavaScript (ni <script> ni attributs on*).
Pas de markdown, pas d'explication, pas de ressources externes.
Le HTML sera injecté dans un div#irp-root.
Design moderne, responsive, accessible.
Utilise des SVG inline pour les icônes et images.
Adapte le design au contexte (dark/light, mobile/desktop, reduced motion, etc.).`;

  // ─── Détection du contexte ──────────────────────────────────────────────────

  function detectContext() {
    const mq = window.matchMedia;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dpr: window.devicePixelRatio || 1,
      theme: mq?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      contrast: mq?.('(prefers-contrast: more)').matches ? 'high' : 'normal',
      reducedMotion: mq?.('(prefers-reduced-motion: reduce)').matches || false,
      lang: navigator.language || 'en',
      online: navigator.onLine,
      touch: 'ontouchstart' in window,
    };
  }

  // ─── Cache simple (localStorage pour le POC) ────────────────────────────────

  function cacheKey(url, context) {
    const fp = [
      context.viewport.width < 768 ? 'mobile' : 'desktop',
      context.theme,
      context.lang,
    ].join(':');
    return `irp:${url}:${fp}`;
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.timestamp > entry.ttl * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.html;
    } catch { return null; }
  }

  function cacheSet(key, html, ttl) {
    try {
      localStorage.setItem(key, JSON.stringify({ html, ttl, timestamp: Date.now() }));
    } catch {}
  }

  // ─── Renderers ──────────────────────────────────────────────────────────────

  function cleanHtml(html) {
    let h = (html || '').trim();
    if (h.startsWith('```')) {
      const lines = h.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      h = lines.join('\n').trim();
    }
    return h.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '')
      .replace(/<\/?head[^>]*>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
  }

  function buildPrompt(irp, context) {
    return `Intent: ${irp.intent}\nData: ${JSON.stringify(irp.data, null, 2)}\nConstraints: ${JSON.stringify(irp.constraints)}\nContext: ${JSON.stringify(context)}\nGénère le HTML optimal.`;
  }

  // Renderer 1: Chrome Prompt API
  async function renderChrome(irp, context) {
    if (!window.ai?.languageModel) throw new Error('Chrome Prompt API non disponible');
    const avail = await window.ai.languageModel.availability();
    if (avail !== 'available') throw new Error(`Chrome Prompt API: ${avail}`);
    const session = await window.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });
    const result = await session.prompt(buildPrompt(irp, context));
    session.destroy();
    return cleanHtml(result);
  }

  // Renderer 2: WebLLM
  let _webllmEngine = null;
  async function renderWebLLM(irp, context) {
    if (!navigator.gpu) throw new Error('WebGPU non disponible');
    if (!_webllmEngine) {
      const { CreateWebMLLMEngine } = await import('https://esm.run/@mlc-ai/web-llm');
      _webllmEngine = await CreateWebMLLMEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', {
        initProgressCallback: (p) => console.log('[IRP Ext][WebLLM]', p.text),
      });
    }
    const reply = await _webllmEngine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(irp, context) },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });
    return cleanHtml(reply.choices[0].message.content);
  }

  // Renderer 3: SGP API via proxy
  let _sgpProxyUrl = '';
  async function renderSGP(irp, context) {
    if (!_sgpProxyUrl) throw new Error('Aucun proxy SGP configuré');
    const resp = await fetch(_sgpProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-qwen',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(irp, context) },
        ],
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });
    if (!resp.ok) throw new Error(`SGP API Error ${resp.status}`);
    const data = await resp.json();
    return cleanHtml(data.choices[0].message.content);
  }

  // ─── Fallback chain ─────────────────────────────────────────────────────────

  async function renderIRP(irp, context, preference) {
    const renderers = [];
    if (preference === 'chrome') renderers.push(renderChrome);
    else if (preference === 'webllm') renderers.push(renderWebLLM);
    else if (preference === 'sgp') renderers.push(renderSGP);
    else {
      // auto: Chrome → WebLLM → SGP
      renderers.push(renderChrome, renderWebLLM, renderSGP);
    }

    let lastError = null;
    for (const renderer of renderers) {
      try {
        const html = await renderer(irp, context);
        if (html && html.length > 50) return html;
      } catch (e) {
        console.warn('[IRP Ext] Renderer échoué:', e.message);
        lastError = e;
      }
    }
    throw lastError || new Error('Tous les renderers ont échoué');
  }

  // ─── Injection du DOM ───────────────────────────────────────────────────────

  function injectDOM(html) {
    // Remplacer le body ou créer un mount point
    let mount = document.getElementById('irp-root');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'irp-root';
      document.body.innerHTML = '';
      document.body.appendChild(mount);
    }
    if (!window.IRPSanitizer) throw new Error('IRPSanitizer introuvable : rendu refusé (échec sécurisé)');
    window.IRPSanitizer.mount(mount, html); // assaini, aucun script exécuté
  }

  function showLoading(message) {
    let loader = document.getElementById('irp-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'irp-loader';
      loader.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;color:#e0e0e0;padding:2rem 3rem;border-radius:12px;font-family:system-ui;z-index:999999;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
      document.body.appendChild(loader);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const spin = document.createElement('div');
    spin.style.cssText = 'width:20px;height:20px;border:2px solid #4CAF50;border-top-color:transparent;border-radius:50%;animation:irp-spin 0.8s linear infinite;';
    const label = document.createElement('span');
    label.textContent = String(message); // texte, jamais du HTML
    row.append(spin, label);
    loader.replaceChildren(row);
    if (!document.getElementById('irp-spin-style')) {
      const style = document.createElement('style');
      style.id = 'irp-spin-style';
      style.textContent = '@keyframes irp-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }
  }

  function hideLoading() {
    const loader = document.getElementById('irp-loader');
    if (loader) loader.remove();
  }

  // ─── Traitement d'une réponse IRP ───────────────────────────────────────────

  async function processIRP(url, irpData, preference, sgpProxyUrl) {
    _sgpProxyUrl = sgpProxyUrl || '';
    const irp = irpData.irp || irpData;
    const context = detectContext();

    // Vérifier le cache
    const key = cacheKey(url, context);
    const cached = cacheGet(key);
    if (cached) {
      injectDOM(cached);
      window.postMessage({ source: 'irp:cached', url }, '*');
      return;
    }

    // Rendre
    showLoading(`Génération IRP: ${irp.intent}…`);
    window.postMessage({ source: 'irp:intercepted', url, intent: irp.intent }, '*');

    try {
      const html = await renderIRP(irp, context, preference);
      hideLoading();
      injectDOM(html);

      // Cacher
      if (irp.context_hints?.cacheable !== false) {
        const ttl = irp.context_hints?.ttl || 3600;
        cacheSet(key, html, ttl);
      }

      window.postMessage({ source: 'irp:rendered', url, intent: irp.intent, htmlLength: html.length }, '*');
    } catch (e) {
      hideLoading();
      console.error('[IRP Ext] Erreur de rendu:', e);
      window.postMessage({ source: 'irp:error', url, error: e.message }, '*');
    }
  }

  // ─── Patch fetch() ──────────────────────────────────────────────────────────

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const contentType = response.headers.get('content-type') || '';

    if (enabled && contentType.includes('application/irp+json')) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const clone = response.clone();
      clone.json().then((irpData) => {
        processIRP(url, irpData, 'auto', '');
      }).catch((e) => {
        console.error('[IRP Ext] Erreur parsing IRP:', e);
      });
    }

    return response;
  };

  // ─── Patch XMLHttpRequest ───────────────────────────────────────────────────

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._irpUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (!enabled) return;
      const contentType = this.getResponseHeader('content-type') || '';
      if (contentType.includes('application/irp+json')) {
        try {
          const irpData = JSON.parse(this.responseText);
          processIRP(this._irpUrl, irpData, 'auto', '');
        } catch (e) {
          console.error('[IRP Ext] Erreur parsing XHR IRP:', e);
        }
      }
    });
    return originalSend.apply(this, args);
  };

  // ─── Écouter les messages du content script ─────────────────────────────────

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.source === 'irp:disable') {
      enabled = false;
      console.log('[IRP Ext] Désactivé');
    } else if (event.data?.source === 'irp:enable') {
      enabled = true;
      console.log('[IRP Ext] Activé');
    } else if (event.data?.source === 'irp:render-command') {
      const { rendererPreference, sgpProxyUrl, url, intent } = event.data;
      // Re-rendre avec une préférence spécifique
      // (utilisé quand l'utilisateur change de renderer dans le popup)
    }
  });

  console.log('[IRP Extension] Injectée et active. Patch fetch() + XHR installé.');
})();
