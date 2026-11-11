// background.js — Service worker de l'extension IRP
// Intercepte les réponses application/irp+json et délègue au content script

const IRP_CONTENT_TYPE = 'application/irp+json';

// État global de l'extension
let extensionState = {
  enabled: true,
  rendererPreference: 'auto', // auto | chrome | webllm | sgp
  sgpProxyUrl: '',
  stats: { intercepted: 0, rendered: 0, cached: 0, errors: 0 },
};

// Charger l'état depuis le storage
chrome.storage.local.get(['irpState'], (result) => {
  if (result.irpState) {
    extensionState = { ...extensionState, ...result.irpState };
  }
});

function saveState() {
  chrome.storage.local.set({ irpState: extensionState });
}

// ─── Intercepter les réponses IRP ────────────────────────────────────────────

// Manifest V3 ne permet plus d'intercepter les réponses via webRequest.onHeadersReceived
// pour modifier le body. On utilise donc une approche par content script qui
// surcharge fetch() et XMLHttpRequest dans la page.

// Le content script (content.js) injecte un script dans la page qui patche
// fetch() et XMLHttpRequest. Quand une réponse a le Content-Type application/irp+json,
// le script envoie un message au content script avec le body JSON.

// Le background sert de coordinateur : il reçoit les messages du content script,
// gère l'état, et renvoie les instructions de rendu.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!extensionState.enabled) {
    sendResponse({ action: 'ignore' });
    return;
  }

  switch (message.type) {
    case 'IRP_INTERCEPTED':
      // Une réponse IRP a été interceptée par le content script
      extensionState.stats.intercepted++;
      saveState();

      // Demander au content script de rendre l'IRP
      sendResponse({
        action: 'render',
        rendererPreference: extensionState.rendererPreference,
        sgpProxyUrl: extensionState.sgpProxyUrl,
      });
      break;

    case 'IRP_RENDERED':
      extensionState.stats.rendered++;
      saveState();
      sendResponse({ ok: true });
      break;

    case 'IRP_CACHED':
      extensionState.stats.cached++;
      saveState();
      sendResponse({ ok: true });
      break;

    case 'IRP_ERROR':
      extensionState.stats.errors++;
      saveState();
      sendResponse({ ok: true });
      break;

    case 'GET_STATE':
      sendResponse(extensionState);
      break;

    case 'SET_STATE':
      extensionState = { ...extensionState, ...message.state };
      saveState();
      sendResponse(extensionState);
      break;

    case 'CLEAR_STATS':
      extensionState.stats = { intercepted: 0, rendered: 0, cached: 0, errors: 0 };
      saveState();
      sendResponse(extensionState);
      break;

    default:
      sendResponse({ error: 'unknown message type' });
  }
});

// ─── Badge dynamique ─────────────────────────────────────────────────────────

function updateBadge() {
  const count = extensionState.stats.intercepted;
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: extensionState.enabled ? '#4CAF50' : '#999' });
}

// Mettre à jour le badge quand l'état change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.irpState) {
    extensionState = { ...extensionState, ...changes.irpState.newValue };
    updateBadge();
  }
});

updateBadge();
