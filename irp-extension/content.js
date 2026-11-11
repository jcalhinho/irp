// content.js — Content script de l'extension IRP
// Injecte un script dans la page qui patche fetch() et XMLHttpRequest
// pour intercepter les réponses application/irp+json

(function () {
  'use strict';

  // ─── Injecter le hook dans la page ──────────────────────────────────────────
  // On doit injecter dans le contexte de la page (pas le content script)
  // pour pouvoir patcher fetch() et XMLHttpRequest.

  const hookScript = document.createElement('script');
  hookScript.src = chrome.runtime.getURL('irp-renderer.js');
  hookScript.onload = () => hookScript.remove();
  (document.head || document.documentElement).appendChild(hookScript);

  // ─── Communication page ↔ content script ↔ background ──────────────────────

  // Le script injecté (irp-renderer.js) poste des messages sur window
  // On les relaye vers le background script

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data?.source?.startsWith('irp:')) return;

    const { source, ...payload } = event.data;

    switch (source) {
      case 'irp:intercepted':
        // Une réponse IRP a été interceptée
        chrome.runtime.sendMessage({ type: 'IRP_INTERCEPTED', ...payload }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.action === 'render') {
            // Demander au script de page de rendre l'IRP
            window.postMessage({
              source: 'irp:render-command',
              rendererPreference: response.rendererPreference,
              sgpProxyUrl: response.sgpProxyUrl,
              ...payload,
            }, '*');
          }
        });
        break;

      case 'irp:rendered':
        chrome.runtime.sendMessage({ type: 'IRP_RENDERED', ...payload });
        break;

      case 'irp:cached':
        chrome.runtime.sendMessage({ type: 'IRP_CACHED', ...payload });
        break;

      case 'irp:error':
        chrome.runtime.sendMessage({ type: 'IRP_ERROR', ...payload });
        break;
    }
  });

  // ─── État activé/désactivé ──────────────────────────────────────────────────

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (chrome.runtime.lastError) return;
    if (state?.enabled === false) {
      // Désactiver le hook
      window.postMessage({ source: 'irp:disable' }, '*');
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_ENABLED') {
      window.postMessage({
        source: message.enabled ? 'irp:enable' : 'irp:disable',
      }, '*');
      sendResponse({ ok: true });
    }
  });
})();
