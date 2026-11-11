// popup.js — Logique du popup de l'extension IRP

document.addEventListener('DOMContentLoaded', () => {
  const enabledEl = document.getElementById('enabled');
  const rendererEl = document.getElementById('renderer');
  const sgpProxyEl = document.getElementById('sgpProxy');
  const clearStatsBtn = document.getElementById('clearStats');

  // Charger l'état depuis le background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (chrome.runtime.lastError || !state) return;
    enabledEl.checked = state.enabled;
    rendererEl.value = state.rendererPreference || 'auto';
    sgpProxyEl.value = state.sgpProxyUrl || '';
    updateStats(state.stats);
  });

  // Activer/désactiver
  enabledEl.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'SET_STATE',
      state: { enabled: enabledEl.checked },
    }, (state) => {
      // Notifier le content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_ENABLED',
            enabled: enabledEl.checked,
          });
        }
      });
    });
  });

  // Changer le renderer
  rendererEl.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'SET_STATE',
      state: { rendererPreference: rendererEl.value },
    });
  });

  // Changer le proxy SGP
  sgpProxyEl.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'SET_STATE',
      state: { sgpProxyUrl: sgpProxyEl.value },
    });
  });

  // Réinitialiser les stats
  clearStatsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_STATS' }, (state) => {
      if (state?.stats) updateStats(state.stats);
    });
  });

  // Mettre à jour les stats en temps réel
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (state?.stats) updateStats(state.stats);
    });
  }, 2000);
});

function updateStats(stats) {
  if (!stats) return;
  document.getElementById('stat-intercepted').textContent = stats.intercepted || 0;
  document.getElementById('stat-rendered').textContent = stats.rendered || 0;
  document.getElementById('stat-cached').textContent = stats.cached || 0;
  document.getElementById('stat-errors').textContent = stats.errors || 0;
}
