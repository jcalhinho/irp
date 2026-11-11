// background.js — injecte le mode lecture UNIQUEMENT quand l'utilisateur le demande (clic, popup ou raccourci).
// Aucune permission d'hôte : « activeTab » ne donne accès qu'à l'onglet actif, au moment de l'action.
async function openReader(tabId, profile) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['reader.js'] });
  return chrome.tabs.sendMessage(tabId, { type: 'IRP_READER_TOGGLE', profile });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'OPEN_READER' || !Number.isInteger(msg.tabId)) return false;
  openReader(msg.tabId, typeof msg.profile === 'string' ? msg.profile : undefined)
    .then((r) => sendResponse({ ok: true, r }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // réponse asynchrone
});

// Raccourci Alt+Maj+L : « _execute_action » ouvre le popup ; le clic sur l'icône aussi. Le popup déclenche openReader.
