// reader.js — Mode lecture adapté IRP (content script)
// Extrait la page, la ré-affiche via le rendu DÉTERMINISTE d'irp-core (profils dyslexie / FALC / basse vision…)
// dans un Shadow DOM fermé : les scripts et styles de la page ne peuvent ni lire ni altérer l'affichage.
// Aucune donnée ne quitte l'appareil. L'IA locale (Chrome Prompt API), si présente, n'est utilisée que sur clic,
// et sa sortie est rejetée si elle perd un nombre, une date, un montant ou un nom.
(function () {
  'use strict';
  if (window.__irpReader) return;
  window.__irpReader = true;

  let host = null, core = null, prevFocus = null, inertChanged = [];
  const state = { profile: 'standard', size: 1, simplify: false, ai: false, doc: null, adapted: null };

  // Deux contextes : extension (chrome.runtime) ou widget intégré à un site (base = origine du widget.js).
  const EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const loadCore = async () => (core ||= await import(EXT ? chrome.runtime.getURL('core/index.js') : String(window.__IRP_BASE || '') + '/core/index.js'));
  const LS = 'irp-reader-prefs';
  const store = EXT ? {
    get: () => new Promise((res) => { try { chrome.storage.local.get(['readerPrefs'], (r) => res((r && r.readerPrefs) || {})); } catch { res({}); } }),
    set: (v) => { try { chrome.storage.local.set({ readerPrefs: v }); } catch { /* best effort */ } },
  } : {
    get: () => { try { return Promise.resolve(JSON.parse(localStorage.getItem(LS)) || {}); } catch { return Promise.resolve({}); } },
    set: (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* best effort */ } },
  };

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
    for (const c of children) e.appendChild(c);
    return e;
  }

  const TOOLBAR_CSS = `
    :host{all:initial}
    .overlay{position:fixed;inset:0;z-index:2147483647;overflow:auto;font:16px/1.5 system-ui,sans-serif}
    .bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem 1rem;background:#111;color:#fff;border-bottom:2px solid #fff}
    .bar label{font-size:14px}
    .bar select,.bar button{min-height:44px;padding:.4rem .8rem;font:inherit;border-radius:6px;border:2px solid #fff;background:#222;color:#fff;cursor:pointer}
    .bar button:focus-visible,.bar select:focus-visible{outline:3px solid #ffd400;outline-offset:2px}
    .bar button[aria-pressed=true]{background:#ffd400;color:#000}
    .grow{flex:1}
    .badge{font-size:14px;padding:.3rem .6rem;border-radius:6px;background:#0b3d0b;border:1px solid #7ddc7d}
    .badge.warn{background:#5c1a00;border-color:#ff9b73}
    .status{position:absolute;left:-9999px}
  `;

  async function aiAdapter() {
    const LM = (typeof self !== 'undefined' && (self.LanguageModel || (self.ai && self.ai.languageModel))) || null;
    if (!LM || typeof LM.create !== 'function') return null;
    try {
      const session = await LM.create({ initialPrompts: [{ role: 'system', content: "Tu réécris des textes en français très simple (FALC) : phrases courtes, mots courants, une idée par phrase. Tu conserves EXACTEMENT tous les nombres, dates, montants, noms et adresses. Tu réponds uniquement par le texte réécrit, sans balises." }] });
      return (t) => session.prompt(t);
    } catch { return null; }
  }

  async function build() {
    const c = await loadCore();
    let doc = state.doc;
    if (!doc) { doc = c.extractDoc(document, { url: location.href }).doc; state.doc = doc; }
    let shown = doc;
    if (state.simplify) {
      if (!state.adapted) {
        const adapter = state.ai ? await aiAdapter() : null;
        state.adapted = (await c.adaptDoc(doc, adapter ? { adapter } : {})).doc;
      }
      shown = state.adapted;
    }
    return { c, doc, shown };
  }

  async function paint(root, status) {
    const { c, doc, shown } = await build();
    const mount = root.querySelector('.content');
    const profile = { ...c.resolveProfile(state.profile), size: c.resolveProfile(state.profile).size * state.size };
    const r = c.renderDoc(shown, mount, { profile });
    const rootEl = mount.querySelector('.irp-root');
    if (rootEl) { rootEl.style.minHeight = '100vh'; }
    const v = c.verifyPreserved(doc, r.text);
    const badge = root.querySelector('.badge');
    badge.className = 'badge' + (v.ok ? '' : ' warn');
    badge.textContent = v.ok ? '✔ Nombres, dates et noms conservés' : '⚠ Éléments manquants : ' + v.missing.slice(0, 3).join(', ');
    status.textContent = v.ok ? 'Mode lecture affiché. Aucun nombre ni date perdu.' : 'Attention : certains éléments sont manquants.';
    if (!v.ok && state.simplify) {
      // garde-fou : la version simplifiée perdrait une information → on affiche l'original, et on le dit
      state.simplify = false; await paint(root, status);
      badge.className = 'badge warn'; badge.textContent = '⚠ Simplification annulée : ' + v.missing.slice(0, 3).join(', ') + ' risquait d’être perdu';
      status.textContent = 'Simplification annulée pour ne rien perdre. Texte d’origine affiché.';
      const pressed = root.querySelector('button[aria-pressed="true"]'); if (pressed && pressed.textContent === 'Texte simplifié') pressed.setAttribute('aria-pressed', 'false');
    }
  }

  async function open(opts = {}) {
    const prefs = await store.get();
    state.profile = opts.profile || prefs.profile || 'standard';
    state.size = prefs.size || 1;
    state.simplify = state.profile === 'falc' || !!prefs.simplify;
    state.doc = null; state.adapted = null; state.ai = false;
    const c = await loadCore();

    host = document.createElement('div'); host.id = 'irp-reader-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style'); style.textContent = TOOLBAR_CSS;

    const profileSel = el('select', { id: 'p', 'aria-label': "Profil d'affichage" });
    for (const [v, t] of [['standard', 'Standard'], ['dyslexie', 'Dyslexie'], ['falc', 'Langage simplifié (FALC)'], ['basse_vision', 'Basse vision'], ['lecture_nuit', 'Lecture de nuit']]) {
      const o = el('option', { value: v, text: t }); if (v === state.profile) o.selected = true; profileSel.appendChild(o);
    }
    const mkBtn = (text, label) => el('button', { type: 'button', text, 'aria-label': label });
    const smaller = mkBtn('A−', 'Réduire le texte'), bigger = mkBtn('A+', 'Agrandir le texte');
    const simpBtn = mkBtn('Texte simplifié', 'Simplifier le texte'); simpBtn.setAttribute('aria-pressed', String(state.simplify));
    const aiBtn = mkBtn('IA locale', "Reformuler avec l'IA locale de votre navigateur"); aiBtn.setAttribute('aria-pressed', 'false');
    const mdBtn = mkBtn('Copier en Markdown', 'Copier le contenu en Markdown');
    const closeBtn = mkBtn('Fermer', 'Fermer le mode lecture (Échap)');
    const badge = el('span', { class: 'badge', text: '…' });
    const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const bar = el('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Options de lecture' }, [
      el('label', { for: 'p', text: 'Profil' }), profileSel, smaller, bigger, simpBtn, aiBtn, mdBtn, el('span', { class: 'grow' }), badge, closeBtn,
    ]);
    const content = el('div', { class: 'content' });
    const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mode lecture adapté' }, [bar, content, status]);
    shadow.append(style, overlay);

    const repaint = () => paint(shadow, status).catch((e) => { status.textContent = 'Erreur : ' + e.message; });
    const save = () => store.set({ profile: state.profile, size: state.size, simplify: state.simplify });
    profileSel.addEventListener('change', () => { state.profile = profileSel.value; if (state.profile === 'falc') { state.simplify = true; simpBtn.setAttribute('aria-pressed', 'true'); } save(); repaint(); });
    smaller.addEventListener('click', () => { state.size = Math.max(0.7, state.size - 0.1); save(); repaint(); });
    bigger.addEventListener('click', () => { state.size = Math.min(2.2, state.size + 0.1); save(); repaint(); });
    simpBtn.addEventListener('click', () => { state.simplify = !state.simplify; simpBtn.setAttribute('aria-pressed', String(state.simplify)); save(); repaint(); });
    aiBtn.addEventListener('click', async () => {
      state.ai = !state.ai; state.adapted = null; aiBtn.setAttribute('aria-pressed', String(state.ai));
      if (state.ai) { state.simplify = true; simpBtn.setAttribute('aria-pressed', 'true'); if (!(await aiAdapter())) { status.textContent = "IA locale indisponible dans ce navigateur : règles déterministes utilisées."; state.ai = false; aiBtn.setAttribute('aria-pressed', 'false'); } }
      repaint();
    });
    mdBtn.addEventListener('click', async () => { const { c: cc, doc } = await build(); try { await navigator.clipboard.writeText(cc.toMarkdown(doc)); status.textContent = 'Markdown copié.'; } catch { status.textContent = 'Copie impossible.'; } });
    closeBtn.addEventListener('click', close);
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

    prevFocus = document.activeElement;
    for (const n of document.body.children) { if (!n.hasAttribute('inert')) { n.setAttribute('inert', ''); inertChanged.push(n); } }
    document.documentElement.appendChild(host);
    await repaint();
    profileSel.focus();
    void c;
  }

  function close() {
    if (!host) return;
    host.remove(); host = null;
    for (const n of inertChanged) n.removeAttribute('inert');
    inertChanged = [];
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch { /* ignore */ } }
  }

  if (EXT) {
    chrome.runtime.onMessage.addListener((msg, _s, send) => {
      if (msg && msg.type === 'IRP_READER_TOGGLE') { if (host) close(); else open({ profile: msg.profile }); send({ ok: true, open: !!host }); }
      return false;
    });
  } else {
    window.__irpReaderToggle = (profile) => { if (host) close(); else return open({ profile }); };
  }
})();
