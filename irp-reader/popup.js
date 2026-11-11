const sel = document.getElementById('profile'), msg = document.getElementById('msg');
chrome.storage.local.get(['readerPrefs'], (r) => { const p = r && r.readerPrefs && r.readerPrefs.profile; if (p) sel.value = p; });
document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !Number.isInteger(tab.id)) { msg.textContent = 'Aucun onglet actif.'; return; }
    chrome.runtime.sendMessage({ type: 'OPEN_READER', tabId: tab.id, profile: sel.value }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) { msg.textContent = 'Cette page ne peut pas être adaptée (page du navigateur ou du Web Store).'; return; }
      window.close();
    });
  });
});
