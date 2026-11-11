// model-router.js — Sélectionne le meilleur renderer selon le contexte

import { SGPRenderer, setProxyUrl, setProxyToken } from './renderers/sgp-api.js';
import { irpCache } from './cache.js';

// Renderers disponibles (chargés dynamiquement)
let _renderers = [];
let _initialized = false;

/**
 * Initialise le model router avec les renderers disponibles.
 * @param {Object} config — { proxyUrl: string, proxyToken?: string }
 */
export async function initRouter(config = {}) {
  if (_initialized) return;

  // 1. Renderer Chrome Prompt API (priorité 1 — le plus rapide)
  let chromeRenderer = null;
  try {
    const mod = await import('./renderers/chrome-api.js');
    chromeRenderer = new mod.ChromeAPIRenderer();
    if (await chromeRenderer.isAvailable()) {
      _renderers.push(chromeRenderer);
      console.log('[IRP Router] ✅ Chrome Prompt API disponible');
    }
  } catch (e) {
    console.log('[IRP Router] ⬚ Chrome Prompt API non disponible');
  }

  // 2. Renderer WebLLM (priorité 2 — local, WebGPU)
  let webllmRenderer = null;
  try {
    const mod = await import('./renderers/webllm.js');
    webllmRenderer = new mod.WebLLMRenderer();
    if (await webllmRenderer.isAvailable()) {
      _renderers.push(webllmRenderer);
      console.log('[IRP Router] ✅ WebLLM disponible');
    }
  } catch (e) {
    console.log('[IRP Router] ⬚ WebLLM non disponible');
  }

  // 3. Renderer LFM3 (priorité 3 — local, ONNX)
  let lfm3Renderer = null;
  try {
    const mod = await import('./renderers/lfm3.js');
    lfm3Renderer = new mod.LFM3Renderer();
    if (await lfm3Renderer.isAvailable()) {
      _renderers.push(lfm3Renderer);
      console.log('[IRP Router] ✅ LFM3 disponible');
    }
  } catch (e) {
    console.log('[IRP Router] ⬚ LFM3 non disponible');
  }

  // 4. Renderer SGP API (priorité 4 — fallback distant, toujours disponible)
  if (config.proxyUrl) {
    setProxyUrl(config.proxyUrl);
    if (config.proxyToken) setProxyToken(config.proxyToken);
    const sgp = new SGPRenderer();
    if (await sgp.isAvailable()) {
      _renderers.push(sgp);
      console.log('[IRP Router] ✅ SGP API (claude-qwen) disponible');
    }
  } else {
    console.log('[IRP Router] ⬚ SGP API: pas de proxy configuré');
  }

  if (_renderers.length === 0) {
    console.warn('[IRP Router] ⚠️ Aucun renderer disponible !');
  }

  _initialized = true;
  console.log(`[IRP Router] ${_renderers.length} renderer(s) disponible(s):`,
    _renderers.map(r => r.getName()).join(', '));
}

/**
 * Rend un IRP en utilisant le meilleur renderer disponible.
 * @param {Object} irp — L'objet IRP { version, intent, data, constraints }
 * @param {Object} context — Le contexte utilisateur détecté
 * @param {Function} onStatus — Callback pour les mises à jour de statut
 * @returns {Promise<{html: string, renderer: string, fromCache: boolean}>}
 */
export async function renderIRP(irp, context, onStatus = null, onChunk = null) {
  const status = (msg) => onStatus?.(msg);

  // 1. Vérifier le cache
  const cached = await irpCache.get(irp, context);
  if (cached) {
    status?.('Rendu depuis le cache');
    console.log('[IRP Router] Cache HIT');
    return { html: cached.html || cached, renderer: 'cache', fromCache: true };
  }

  // 2. Choisir le renderer selon le contexte
  const ordered = _selectRenderers(irp, context);

  // 3. Essayer chaque renderer dans l'ordre
  for (const renderer of ordered) {
    try {
      status?.(`Génération via ${renderer.getName()}…`);
      console.log(`[IRP Router] Essai: ${renderer.getName()}`);

      // Passer onChunk si le renderer le supporte (3e argument)
      const html = await renderer.render(irp, context, onChunk);

      if (html && html.trim().length > 0) {
        // Mettre en cache
        const ttl = irp.context_hints?.ttl || 3600;
        const cacheable = irp.context_hints?.cacheable !== false;
        if (cacheable) {
          await irpCache.set(irp, context, { html, renderer: renderer.getName() }, ttl);
        }

        console.log(`[IRP Router] ✅ Rendu par ${renderer.getName()} (${html.length} bytes)`);
        return { html, renderer: renderer.getName(), fromCache: false };
      }
    } catch (e) {
      console.warn(`[IRP Router] ❌ ${renderer.getName()} a échoué:`, e.message);
      status?.(`${renderer.getName()} a échoué, fallback…`);
    }
  }

  throw new Error('Tous les renderers ont échoué');
}

/**
 * Sélectionne et ordonne les renderers selon le contexte et l'intent.
 */
function _selectRenderers(irp, context) {
  const intent = irp.intent;
  const isComplex = ['show_dashboard', 'fill_form', 'show_catalog'].includes(intent);
  const isOffline = !context.device.online;
  const hasWebGPU = context.device.gpu;
  const isLowEnd = (context.device.ram && context.device.ram < 4) || context.device.cores < 4;

  let ordered = [..._renderers];

  // Si hors ligne, on ne garde que les renderers locaux
  if (isOffline) {
    ordered = ordered.filter(r =>
      r.getName().includes('Chrome') || r.getName().includes('WebLLM') || r.getName().includes('LFM3')
    );
  }

  // Si intent complexe et pas hors ligne, privilégier SGP API (qualité supérieure)
  if (isComplex && !isOffline && !isLowEnd) {
    ordered.sort((a, b) => {
      const aIsSGP = a.getName().includes('SGP');
      const bIsSGP = b.getName().includes('SGP');
      if (aIsSGP && !bIsSGP) return -1;
      if (!aIsSGP && bIsSGP) return 1;
      return 0;
    });
  }

  // Si device faible, privilégier SGP API (pas de ressource locale)
  if (isLowEnd && !isOffline) {
    ordered.sort((a, b) => {
      const aIsSGP = a.getName().includes('SGP');
      const bIsSGP = b.getName().includes('SGP');
      if (aIsSGP && !bIsSGP) return -1;
      if (!aIsSGP && bIsSGP) return 1;
      return 0;
    });
  }

  return ordered;
}

/** Retourne la liste des renderers disponibles (debug) */
export function getAvailableRenderers() {
  return _renderers.map(r => r.getName());
}

