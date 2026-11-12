// Lecteur local, sans dépendance : seul le chargement d'une URL passe par le serveur.
import {
  extractDoc, adaptDoc, renderDoc, resolveProfile, verifyPreserved, readability, docText, toMarkdown, approxTokens, auditSource,
  DEFAULT_READING, MAX_READING_CHARS, readingPrefs, fromPlainText, compareReading, readingFilename, checkPreserved, parseReadingHtml, validateDoc,
} from '/core/index.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'irp-lecture-settings-v1';
let prefs;
try { prefs = readingPrefs(JSON.parse(localStorage.getItem(PREFS_KEY))); } catch { prefs = { ...DEFAULT_READING }; }
const state = { prefs, doc: null, shown: null, adapted: null, md: '', url: '', view: 't-read', controller: null, generation: 0, busy: false };
const DEMO = `Un coup de pouce pour les activités des enfants

La mairie propose une aide pour les activités sportives et culturelles des enfants. Ce courrier est un exemple fictif pour découvrir le lecteur.

## Qui peut en bénéficier ?

Les familles domiciliées dans la commune peuvent solliciter une aide de 120 € par enfant. Le dossier doit être déposé avant le 15 décembre 2026. Vous ne devez pas envoyer de documents originaux.

## Les documents à préparer

- Un justificatif de domicile de moins de 3 mois
- Une attestation d’inscription à l’activité
- Le formulaire de demande complété

## Comment déposer la demande ?

Afin de bénéficier de cette aide, vous pouvez déposer votre dossier à l’accueil de la mairie. Le service vous répondra ultérieurement par courrier. Conservez une copie de votre demande.

## Une question ?

Vous pouvez contacter le service au 01 23 45 67 89. L’accueil est ouvert du lundi au vendredi, de 9 h à 17 h. Ce numéro est fictif.`;

let messageTimer;
function msg(text, err = false) {
  clearTimeout(messageTimer); $('status-area').hidden = false;
  $('msg').textContent = text; $('msg').className = err ? 'err' : '';
  $('dismiss-message').hidden = !state.doc || state.busy;
  scheduleMessageDismissal();
}
function scheduleMessageDismissal() {
  clearTimeout(messageTimer);
  if (state.doc && !$('msg').classList.contains('err') && !state.busy) messageTimer = setTimeout(() => {
    if (!$('status-area').contains(document.activeElement)) $('status-area').hidden = true;
  }, 6500);
}
function element(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* stockage désactivé : lecture possible */ } }
function syncPrefs() {
  for (const id of ['profile', 'font', 'theme']) $(id).value = state.prefs[id];
  $('simplify').checked = state.prefs.simplify;
  $('size-label').textContent = Math.round(state.prefs.size * 100) + ' %';
  $('smaller').disabled = state.prefs.size <= 0.8; $('bigger').disabled = state.prefs.size >= 1.8;
}
const compactReader = window.matchMedia('(max-width: 56rem)');
function syncReaderLayout() {
  $('reading-options').open = !compactReader.matches;
  $('outline-options').open = !compactReader.matches;
}
compactReader.addEventListener('change', syncReaderLayout);
function busy(on) {
  state.busy = on;
  $('load').disabled = on; $('cancel').hidden = !on;
  $('composer').setAttribute('aria-busy', String(on));
  $('dismiss-message').hidden = !state.doc || on;
  scheduleMessageDismissal();
}
function cancel() {
  state.generation++;
  state.controller?.abort(); state.controller = null; busy(false);
}
function inputView(id, focus = false) { selectTab(id, ['input-url', 'input-text'], ['url-panel', 'text-panel']); if (focus) $(id === 'input-url' ? 'url' : 'paste').focus(); }
function selectTab(id, tabs, panels) {
  tabs.forEach((t, i) => { const on = t === id; $(t).setAttribute('aria-selected', String(on)); $(t).tabIndex = on ? 0 : -1; $(panels[i]).hidden = !on; });
  if (tabs.includes('t-read')) $('alternate-title').hidden = id === 't-read';
}
function wireTabs(tabs, panels, callback = () => {}) {
  const select = (id) => { selectTab(id, tabs, panels); callback(id); };
  tabs.forEach((id, i) => {
    $(id).addEventListener('click', () => select(id));
    $(id).addEventListener('keydown', (e) => {
      let n;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = tabs.length - 1;
      if (n == null) return;
      e.preventDefault(); select(tabs[n]); $(tabs[n]).focus();
    });
  });
}

async function load(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
  } catch { msg('Cette adresse n’est pas valide. Utilisez une adresse http ou https sans identifiants.', true); $('url').focus(); return; }
  cancel(); const gen = state.generation;
  const controller = new AbortController(); state.controller = controller; busy(true);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
  msg('Ouverture de la page… Vous pouvez annuler ou coller son texte.');
  try {
    const response = await fetch('/__fetch?url=' + encodeURIComponent(url.href), { signal: controller.signal, headers: { Accept: 'application/json' } });
    let data; try { data = await response.json(); } catch { throw new Error('La récupération d’adresses n’est pas disponible ici. Collez le texte ou importez un fichier.'); }
    if (!response.ok) throw new Error(data.message || `Cette page ne peut pas être récupérée (erreur ${response.status}). Collez son texte à la place.`);
    if (gen !== state.generation) return;
    await showHtml(data, 'web', gen);
  } catch (e) {
    if (gen !== state.generation) return;
    if (e.name === 'AbortError' && !timedOut) return;
    $('composer').open = true; inputView('input-text');
    msg(timedOut ? 'Cette page met trop de temps à répondre. Collez son texte à la place.' : e.message || 'Impossible d’ouvrir cette page.', true);
  } finally { clearTimeout(timeout); if (gen === state.generation) { state.controller = null; busy(false); } }
}

async function showHtml(data, kind, gen) {
  if (typeof data.html !== 'string' || data.html.length > MAX_READING_CHARS * 4) throw new Error('Ce fichier HTML est trop volumineux (maximum 4 Mo).');
  const parsed = parseReadingHtml(data.html, document);
  const { doc, report } = extractDoc(parsed, data.url ? { url: data.url } : {});
  if (!doc.blocks.length || docText(doc).trim().length < 30) throw new Error('Aucun texte suffisamment long à lire. La page est peut-être dynamique ou protégée : collez son contenu.');
  await show(doc, { kind, report, audit: auditSource(parsed), htmlTokens: approxTokens(data.html), truncated: data.truncated || report.truncated, url: data.url || '' }, gen);
}

async function show(doc, meta, gen) {
  const validation = validateDoc(doc);
  if (!validation.ok) throw new Error('Ce contenu dépasse les limites du lecteur : ' + validation.errors[0] + '. Essayez une section plus courte.');
  const adapted = await adaptDoc(doc);
  if (gen !== state.generation) return;
  state.doc = doc; state.adapted = adapted.doc; state.meta = meta; state.url = meta.url || ''; state.md = toMarkdown(doc);
  $('md').textContent = state.md;
  $('source-kind').textContent = { web: 'PAGE WEB', paste: 'TEXTE COLLÉ', file: 'FICHIER LOCAL', demo: 'EXEMPLE FICTIF' }[meta.kind];
  const words = docText(doc).split(/\s+/).filter(Boolean).length;
  $('reading-time').textContent = `${words.toLocaleString('fr-FR')} mots · environ ${Math.max(1, Math.ceil(words / 200))} min de lecture`;
  const source = $('source-link'); source.hidden = !state.url; if (state.url) source.href = state.url; else source.removeAttribute('href');
  $('share').hidden = !state.url;
  const hash = state.url ? '#u=' + encodeURIComponent(state.url) : '';
  history.replaceState(null, '', location.pathname + location.search + hash);
  document.title = doc.title + ' — IRP Lecture';
  $('alternate-title').textContent = doc.title;
  document.body.classList.add('has-document'); $('out').hidden = false; $('composer').open = false;
  syncReaderLayout();
  state.view = 't-read'; selectTab('t-read', ['t-read', 't-compare', 't-md'], ['p-read', 'p-compare', 'p-md']);
  paint();
  msg(meta.truncated ? 'Attention : cette page a été tronquée. Consultez la source pour la version complète.' : 'Votre lecture est prête. Le texte extrait reste disponible dans Comparer.');
  $('p-read').focus({ preventScroll: true });
  $('out').scrollIntoView({ behavior: 'instant', block: 'start' });
}

function readingProfile() { const p = state.prefs; return { ...resolveProfile(p.profile), theme: p.theme, font: p.font, size: p.size * resolveProfile(p.profile).size }; }
function paint() {
  if (!state.doc) return;
  state.shown = state.prefs.simplify ? state.adapted : state.doc;
  const r = renderDoc(state.shown, $('p-read'), { profile: readingProfile(), embedded: true, titleLevel: 1, idPrefix: 'read' });
  if (!r.ok) { msg('Ce document ne peut pas être affiché : ' + r.errors[0], true); return; }
  const v = verifyPreserved(state.doc, r.text);
  const rows = compareReading(state.doc, state.shown); const changed = rows.filter((row) => row.changed).length;
  $('change-count').textContent = changed ? String(changed) : '';
  $('fidelity-text').textContent = !v.ok ? 'Certains éléments repérés manquent à l’affichage. Consultez Comparer et la source.' : changed ? `${changed} passage${changed > 1 ? 's' : ''} reformulé${changed > 1 ? 's' : ''} par règles locales. Comparez avec le texte extrait.` : 'Texte extrait inchangé. Seule la présentation est adaptée.';
  $('fidelity').classList.toggle('warn', !v.ok || changed > 0);
  const comparison = $('comparison'); comparison.replaceChildren();
  rows.forEach((row) => {
    const pair = element('div', null, 'compare-row' + (row.changed ? ' changed' : ''));
    for (const [label, text] of [['Texte extrait', row.original], ['Version de lecture', row.adapted]]) {
      const cell = element('div'); cell.append(element('span', label + (row.changed ? ' · passage modifié' : ''), 'compare-label'));
      cell.append(element('p', text)); pair.append(cell);
    }
    comparison.append(pair);
  });
  const toc = $('toc'); toc.replaceChildren();
  $('p-read').querySelectorAll('#read-main h2,#read-main h3,#read-main h4,#read-main h5,#read-main h6').forEach((h, n) => {
    h.id = 'section-' + n; h.tabIndex = -1;
    const a = element('a', h.textContent); a.href = '#' + h.id;
    a.addEventListener('click', (e) => { e.preventDefault(); state.view = 't-read'; selectTab('t-read', ['t-read', 't-compare', 't-md'], ['p-read', 'p-compare', 'p-md']); h.focus({ preventScroll: true }); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const li = element('li'); li.append(a); toc.append(li);
  });
  $('outline').hidden = !toc.childElementCount;
  $('toc-count').textContent = toc.childElementCount ? String(toc.childElementCount) : '';
  diagnostics(v, changed);
  syncPrefs();
}
function diagnostics(v, changed) {
  const before = readability(docText(state.doc)), after = readability(docText(state.shown));
  const grid = $('metrics'); grid.replaceChildren();
  const entries = [
    [v.ok ? 'Présents' : 'À vérifier', 'Nombres et noms repérés dans le texte extrait'],
    [String(changed), 'Passages reformulés'],
    [`${before.avgWords} → ${after.avgWords}`, 'Mots par phrase (estimation)'],
    [`${approxTokens(state.md).toLocaleString('fr-FR')}`, 'Tokens Markdown (estimation)'],
  ];
  if (state.meta.htmlTokens) entries.push([String(state.meta.htmlTokens.toLocaleString('fr-FR')), 'Tokens HTML source (estimation)']);
  entries.forEach(([big, label]) => { const c = element('div', null, 'metric'); c.append(element('b', big), element('span', label)); grid.append(c); });
  const report = state.meta.report;
  const extraction = report?.sourceText ? checkPreserved(report.sourceText, docText(state.doc)) : null;
  $('extraction-note').textContent = state.meta.kind === 'paste' || state.meta.kind === 'demo' ? 'Le texte fourni est la source de cette lecture.' : `Contenu sélectionné : ${report?.root || 'document'}. Menus, formulaires et médias sont retirés.`;
  if (extraction && !extraction.ok) $('extraction-note').textContent += ' Des éléments repérés dans cette zone n’ont pas été extraits : ' + extraction.missing.slice(0, 8).join(', ') + '. Consultez la page source.';
  if (state.meta.truncated) $('extraction-note').textContent += ' Attention : contenu tronqué.';
  const list = $('issues'); list.replaceChildren();
  if (!state.meta.audit) list.append(element('li', 'Non applicable au texte brut.'));
  else if (!state.meta.audit.issues.length) list.append(element('li', 'Aucun défaut courant repéré automatiquement.'));
  else state.meta.audit.issues.forEach((i) => list.append(element('li', `${i.label} : ${i.count}`)));
}

function download(body, type, ext) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = element('a'); a.href = url; a.download = readingFilename(state.doc.title, ext); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function portableHtml() {
  const doc = document.implementation.createHTMLDocument(state.doc.title);
  doc.documentElement.lang = state.doc.lang || 'fr';
  const charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8'); doc.head.prepend(charset);
  const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'; doc.head.append(viewport);
  const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy'; csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"; doc.head.append(csp);
  const mount = doc.createElement('div'); doc.body.append(mount); renderDoc(state.shown, mount, { profile: readingProfile() });
  const note = doc.createElement('p'); note.textContent = 'Copie de lecture IRP · ' + (state.prefs.simplify ? 'Vocabulaire adapté par règles locales. ' : 'Texte extrait sans reformulation. ') + 'L’extraction peut omettre du contenu.';
  if (state.url) { const link = doc.createElement('a'); link.href = state.url; link.textContent = ' Consulter la page source'; link.rel = 'noopener noreferrer'; note.append(link); }
  mount.querySelector('.irp-page').append(note);
  doc.body.style.margin = '0';
  doc.body.style.fontSize = '18px';
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); msg(success); }
  catch {
    if (text !== state.md) { msg('La copie automatique est indisponible. Copiez l’adresse depuis la barre du navigateur.', true); return; }
    state.view = 't-md'; selectTab('t-md', ['t-read', 't-compare', 't-md'], ['p-read', 'p-compare', 'p-md']); const range = document.createRange(); range.selectNodeContents($('md')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); $('md').focus(); msg('La copie automatique est indisponible. Le Markdown est sélectionné : utilisez Ctrl/Cmd + C.', true);
  }
}
function focusMode(on) { document.body.classList.toggle('focus-reading', on); $('focus-mode').setAttribute('aria-pressed', String(on)); $('exit-focus').hidden = !on; if (on) $('exit-focus').focus(); else $('focus-mode').focus(); }

wireTabs(['input-url', 'input-text'], ['url-panel', 'text-panel']);
wireTabs(['t-read', 't-compare', 't-md'], ['p-read', 'p-compare', 'p-md'], (id) => { state.view = id; });
$('form').addEventListener('submit', (e) => { e.preventDefault(); const url = $('url').value.trim(); if (!url) { msg('Collez une adresse de page.', true); $('url').focus(); return; } load(url); });
$('cancel').addEventListener('click', () => { cancel(); msg('Ouverture annulée.'); });
$('dismiss-message').addEventListener('click', () => { $('status-area').hidden = true; });
$('import-file').addEventListener('click', () => $('file').click());
$('paste-go').addEventListener('click', async () => { cancel(); try { const doc = fromPlainText($('paste').value); await show(doc, { kind: 'paste' }, state.generation); } catch (e) { msg(e.message, true); $('paste').focus(); } });
$('demo').addEventListener('click', async () => { cancel(); await show(fromPlainText(DEMO), { kind: 'demo' }, state.generation); });
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; if (!file) return;
  cancel(); const gen = state.generation;
  try {
    if (file.size > MAX_READING_CHARS * 4) throw new Error('Fichier trop volumineux (maximum 4 Mo).');
    const raw = await file.text(); if (gen !== state.generation) return;
    if (/\.html?$/i.test(file.name)) await showHtml({ html: raw }, 'file', gen);
    else await show(fromPlainText(raw, file.name.replace(/\.[^.]+$/, '')), { kind: 'file' }, gen);
  } catch (e) { if (gen === state.generation) msg(e.message, true); }
  finally { $('file').value = ''; }
});
for (const id of ['profile', 'font', 'theme', 'simplify']) $(id).addEventListener('change', () => {
  state.prefs[id] = id === 'simplify' ? $(id).checked : $(id).value;
  if (id === 'profile') { const base = resolveProfile(state.prefs.profile); state.prefs.theme = base.theme; state.prefs.font = base.font === 'systeme' ? 'serif' : base.font; }
  savePrefs(); paint();
});
for (const [id, delta] of [['smaller', -0.1], ['bigger', 0.1]]) $(id).addEventListener('click', () => { state.prefs.size = Math.round(Math.max(0.8, Math.min(1.8, state.prefs.size + delta)) * 10) / 10; savePrefs(); paint(); });
$('reset-prefs').addEventListener('click', () => { state.prefs = { ...DEFAULT_READING }; savePrefs(); paint(); msg('Réglages de lecture réinitialisés.'); });
$('copy-md').addEventListener('click', () => copy(state.md, 'Markdown copié, sans simplification.'));
$('dl-md').addEventListener('click', () => { download(state.md, 'text/markdown;charset=utf-8', 'md'); msg('Markdown téléchargé, sans simplification.'); });
$('dl-html').addEventListener('click', () => { download(portableHtml(), 'text/html;charset=utf-8', 'html'); msg('Lecture téléchargée. Ouvrez ce fichier même sans connexion.'); });
$('print').addEventListener('click', () => window.print());
$('share').addEventListener('click', () => copy(location.href, 'Lien copié. La page sera récupérée à nouveau à l’ouverture ; ce n’est pas une copie figée.'));
$('focus-mode').addEventListener('click', () => focusMode(true)); $('exit-focus').addEventListener('click', () => focusMode(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('focus-reading')) focusMode(false); });
syncPrefs();
syncReaderLayout();
if (document.documentElement.dataset.fetchMode === 'unavailable') {
  inputView('input-text'); $('form').hidden = true; $('url-unavailable').hidden = false;
}
function openHash() {
  const match = /^#u=(.+)$/.exec(location.hash);
  if (match) { try { const url = decodeURIComponent(match[1]); if (/^https?:\/\//i.test(url) && url !== state.url) { $('url').value = url; load(url); } } catch { msg('Ce lien de lecture est invalide.', true); } }
}
window.addEventListener('hashchange', openHash);
openHash();
