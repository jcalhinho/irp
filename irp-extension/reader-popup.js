// Bouton « Mode lecture » du popup : envoie la commande à l'onglet actif.
(function () {
  const sel = document.getElementById('readerProfile');
  const btn = document.getElementById('readerOpen');
  const msg = document.getElementById('readerMsg');
  chrome.storage.local.get(['readerPrefs'], (r) => { const p = r && r.readerPrefs && r.readerPrefs.profile; if (p) sel.value = p; });
  btn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) { msg.textContent = 'Aucun onglet actif.'; return; }
      chrome.tabs.sendMessage(tab.id, { type: 'IRP_READER_TOGGLE', profile: sel.value }, () => {
        if (chrome.runtime.lastError) { msg.textContent = 'Rechargez la page puis réessayez (page protégée ou ancienne).'; return; }
        window.close();
      });
    });
  });
})();
