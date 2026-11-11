// irp-client.js — Client IRP principal v2
// Orchestre : fetch IRP → détecte contexte → route vers le meilleur renderer → injecte le DOM
// Améliorations: error recovery avec retry, loading states enrichis, navigation SPA robuste

import { ContextSensor } from './context-sensor.js';
import { DomBuilder } from './dom-builder.js';
import { initRouter, renderIRP, getAvailableRenderers } from './model-router.js';
import { irpCache } from './cache.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const IRP_SERVER = window.IRP_CONFIG?.server || 'http://localhost:8001';
// Jeton optionnel du proxy (déploiement hors localhost). Jamais de clé API côté navigateur :
// la clé SGP reste sur le serveur, le navigateur ne parle qu'au proxy.
const PROXY_TOKEN = window.IRP_CONFIG?.proxyToken || '';

// ─── État global ────────────────────────────────────────────────────────────

const sensor = new ContextSensor();
const builder = new DomBuilder('irp-root');
let _context = null;
let _currentPath = null;
let _isNavigating = false;

// ─── Initialisation ─────────────────────────────────────────────────────────

async function main() {
  builder.showLoading('Initialisation du client IRP…');

  // 1. Détecter le contexte utilisateur
  _context = await sensor.detect();
  console.log('[IRP Client] Contexte détecté:', _context);

  // 2. Initialiser le model router (détecte les renderers disponibles)
  builder.showLoading('Détection des modèles IA disponibles…');
  const proxyUrl = `${IRP_SERVER}/__proxy/sgp`;
  await initRouter({ proxyUrl, proxyToken: PROXY_TOKEN });

  const renderers = getAvailableRenderers();
  if (renderers.length === 0) {
    builder.showError(
      'Aucun modèle IA disponible',
      'Le client IRP n\'a trouvé aucun moteur de rendu. Démarrez le serveur IRP avec SGP_API_KEY (proxy SGP) ou utilisez Chrome avec Prompt API activé.',
      `Proxy SGP: ${proxyUrl}\nServeur IRP: ${IRP_SERVER}\nRenderers testés: Chrome Prompt API, WebLLM, LFM3, SGP API`,
      () => main()
    );
    return;
  }

  // 3. Afficher le debug panel
  _showDebug(_context, renderers);

  // 4. Router : déterminer la route depuis l'URL
  const path = window.location.pathname;
  const irpPath = path === '/' || path === '/index.html' ? '/' : path;

  // 5. Navigation initiale
  await navigateTo(irpPath);

  // 6. Gérer la navigation (liens cliqués dans le DOM généré)
  _setupNavigation();
}

// ─── Navigation ─────────────────────────────────────────────────────────────

async function navigateTo(path, pushState = true) {
  if (_isNavigating) return;
  _isNavigating = true;
  _currentPath = path;

  if (pushState && path !== window.location.pathname) {
    window.history.pushState({}, '', path);
  }

  // 1. Vérifier le cache local d'abord (passe path + context)
  const cached = await irpCache.get(path, _context);
  if (cached) {
    builder.inject(cached.html);
    console.log(`[IRP Client] ✅ Rendu depuis cache (renderer: ${cached.renderer})`);
    _updateDebug({ renderer: cached.renderer + ' (cache)', fromCache: true, htmlSize: cached.html.length });
    _isNavigating = false;
    return;
  }

  // 2. Fetch l'IRP depuis le serveur
  builder.showLoading(`Récupération de l'intent: ${path}…`);
  let irp;
  try {
    irp = await _fetchIRP(path);
  } catch (e) {
    builder.showError(
      'Serveur IRP injoignable',
      `Impossible de contacter le serveur IRP sur ${IRP_SERVER}${path}`,
      e.message,
      () => navigateTo(path, false)
    );
    _isNavigating = false;
    return;
  }

  // 3. Rendre l'IRP
  builder.showLoading(`Génération de l'interface…`);
  try {
    // Streaming: afficher le HTML progressivement pendant la génération
    let streamBuffer = '';
    const onChunk = (delta, full) => {
      streamBuffer = full;
      // Injecter le HTML partiel pour affichage progressif
      // (sans transitions pour éviter les clignotements pendant le stream)
      builder.root.style.opacity = '1';
      builder.setHTML(full); // assaini, aucun script exécuté
    };

    const result = await renderIRP(irp, _context, (status) => {
      builder.showLoading(status);
    }, onChunk);

    // 4. Injecter le DOM final (avec transition cette fois)
    builder.inject(result.html);
    console.log(`[IRP Client] ✅ Rendu par ${result.renderer} (cache: ${result.fromCache})`);

    // 5. Mettre à jour le debug
    _updateDebug({ renderer: result.renderer, fromCache: result.fromCache, htmlSize: result.html.length });

    // 6. Cacher le résultat (passe path + context)
    if (!result.fromCache) {
      await irpCache.set(path, _context, { html: result.html, renderer: result.renderer }, irp.context_hints?.ttl || 3600);
    }

  } catch (e) {
    builder.showError(
      'Échec du rendu IA',
      'Tous les modèles IA ont échoué à générer l\'interface.',
      e.message,
      () => navigateTo(path, false)
    );
  }

  _isNavigating = false;
}

// ─── Fetch IRP ──────────────────────────────────────────────────────────────

async function _fetchIRP(path) {
  const url = `${IRP_SERVER}${path}`;
  console.log(`[IRP Client] Fetch IRP: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/irp+json',
      'X-IRP-Context': JSON.stringify({
        device: _context.device.type,
        theme: _context.prefs.theme,
        lang: _context.prefs.lang,
        viewport: `${_context.screen.viewportWidth}x${_context.screen.viewportHeight}`,
      }),
    },
  });

  if (!response.ok) {
    // Si 404, le serveur renvoie un IRP d'erreur — on le récupère
    if (response.status === 404) {
      const data = await response.json();
      const irp = data.irp || data;
      if (irp.intent === 'show_error') {
        console.log(`[IRP Client] IRP d'erreur reçu: ${irp.data.status}`);
        return irp;
      }
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Le serveur peut renvoyer soit { irp: {...} } soit directement l'IRP
  const irp = data.irp || data;
  if (!irp.intent || !irp.data) {
    throw new Error('Réponse IRP invalide: intent ou data manquant');
  }

  console.log(`[IRP Client] IRP reçu: intent=${irp.intent}`);
  return irp;
}

// ─── Cache key ──────────────────────────────────────────────────────────────

function _buildCacheKey(path) {
  const ctx = _context;
  const fingerprint = [
    path,
    ctx.device.type,
    ctx.prefs.theme,
    ctx.prefs.lang,
    `${ctx.screen.viewportWidth}x${ctx.screen.viewportHeight}`,
    ctx.a11y.reducedMotion ? 'rm' : '',
    ctx.a11y.contrast === 'high' ? 'hc' : '',
  ].filter(Boolean).join(':');
  return fingerprint;
}

// ─── Navigation SPA ─────────────────────────────────────────────────────────

function _setupNavigation() {
  // Intercepte les clics sur les liens pour faire du rendu IRP sans recharger la page
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');

    // Liens externes → navigation normale
    if (href.startsWith('http://') || href.startsWith('https://')) return;
    // Ancres → navigation normale
    if (href.startsWith('#')) return;
    // Actions API (POST) → navigation normale
    if (href.startsWith('/api/')) return;

    // Liens internes → rendu IRP
    e.preventDefault();
    console.log(`[IRP Client] Navigation vers: ${href}`);
    await navigateTo(href);
  });

  // Gère le bouton back/forward
  window.addEventListener('popstate', async () => {
    const path = window.location.pathname;
    await navigateTo(path, false);
  });
}

// ─── Debug panel ────────────────────────────────────────────────────────────

function _showDebug(context, renderers) {
  const debug = document.getElementById('irp-debug');
  const content = document.getElementById('irp-debug-content');
  if (!debug || !content) return;

  const rows = [
    ['Serveur IRP', IRP_SERVER],
    ['Renderers', renderers.join(', ') || 'aucun'],
    ['Thème', context.prefs.theme],
    ['Langue', context.prefs.lang],
    ['Appareil', context.device.type],
    ['Écran', `${context.screen.viewportWidth}x${context.screen.viewportHeight}`],
    ['DPR', context.screen.dpr],
    ['GPU', context.device.gpu ? '✅' : '❌'],
    ['Cores', context.device.cores],
    ['RAM', context.device.ram ? `${context.device.ram}GB` : '?'],
    ['Réseau', context.network.type],
    ['Contraste', context.a11y.contrast],
    ['Mouvement réduit', context.a11y.reducedMotion ? '✅' : '❌'],
    ['Taille police', context.a11y.fontSize],
    ['Batterie', context.battery.level !== null ? `${Math.round(context.battery.level * 100)}%` : '?'],
  ];

  content.innerHTML = rows.map(([k, v]) =>
    `<div class="irp-debug__row"><span>${k}</span><span>${v}</span></div>`
  ).join('');

  // Toggle avec la touche D
  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debug.classList.toggle('irp-debug--hidden');
    }
  });

  // Bouton fermer
  const closeBtn = document.getElementById('irp-debug-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => debug.classList.add('irp-debug--hidden'));
  }
}

function _updateDebug(info) {
  const content = document.getElementById('irp-debug-content');
  if (!content) return;

  const rows = [
    ['Renderer', info.renderer],
    ['Cache', info.fromCache ? '✅ HIT' : '❌ MISS'],
    ['HTML size', `${info.htmlSize} bytes`],
  ];

  const html = rows.map(([k, v]) =>
    `<div class="irp-debug__row"><span>${k}</span><span>${v}</span></div>`
  ).join('');

  content.innerHTML = html + content.innerHTML;
}

// ─── Démarrage ──────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('[IRP Client] Erreur fatale:', err);
  builder.showError('Erreur fatale', 'Le client IRP n\'a pas pu démarrer.', err.message, () => location.reload());
});
