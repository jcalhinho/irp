// Outil « colle une URL » — tout le traitement du HTML se fait DANS le navigateur (DOMParser : scripts et images inertes).
import {
  extractDoc, adaptDoc, renderDoc, resolveProfile, verifyPreserved, readability, docText, toMarkdown, approxTokens, auditSource,
} from '/core/index.js';

const $ = (id) => document.getElementById(id);
const state = { doc: null, shown: null, profile: 'falc', size: 1, md: '', url: '' };
const EXAMPLES = []; // renseignés par le déploiement (adresses publiques de démonstration)

function msg(text, err = false) { const m = $('msg'); m.textContent = text; m.className = err ? 'err' : ''; }
const card = (big, label, cls = '') => { const d = document.createElement('div'); d.className = 'card'; const b = document.createElement('b'); b.textContent = big; if (cls) b.className = cls; const s = document.createElement('small'); s.textContent = label; d.append(b, s); return d; };

async function load(url) {
  msg('Téléchargement de la page…');
  $('out').hidden = true;
  let res;
  try { res = await fetch('/__fetch?url=' + encodeURIComponent(url), { headers: { Accept: 'application/json' } }); }
  catch { return msg("Le serveur est injoignable.", true); }
  let data = {};
  try { data = await res.json(); } catch { /* corps non JSON */ }
  if (!res.ok) return msg(data.message || `Erreur ${res.status}`, true);

  msg('Analyse…');
  const parsed = new DOMParser().parseFromString(data.html, 'text/html'); // inerte : ni script ni chargement d'images
  const { doc, report } = extractDoc(parsed, { url: data.url });
  if (!doc.blocks.length) return msg("Aucun contenu lisible n'a pu être extrait de cette page (page vide ou entièrement dynamique).", true);
  const audit = auditSource(parsed);
  state.url = data.url; state.doc = doc; state.md = toMarkdown(doc); state.adapted = null;

  // métriques indépendantes du profil
  const before = readability(docText(doc));
  const grid = $('metrics'); grid.replaceChildren();
  state.metrics = { before, bytes: data.bytes, tokHtml: approxTokens(data.html), tokMd: approxTokens(state.md), audit, truncated: data.truncated, noAlt: report.imagesNoAlt };
  await paint();

  const list = $('issues'); list.replaceChildren();
  if (!audit.issues.length) { const li = document.createElement('li'); li.textContent = 'Aucun défaut courant repéré.'; list.appendChild(li); }
  for (const i of audit.issues) { const li = document.createElement('li'); li.textContent = `${i.label} : ${i.count}`; list.appendChild(li); }
  $('md').textContent = state.md;
  $('out').hidden = false;
  history.replaceState(null, '', '#u=' + encodeURIComponent(url));
  msg(data.truncated ? 'Page très longue : seule la première partie a été analysée.' : 'Terminé.');
  $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function paint() {
  const doc = state.doc; if (!doc) return;
  const base = resolveProfile(state.profile);
  const profile = { ...base, size: base.size * state.size };
  let shown = doc;
  if (base.falc) { state.adapted ||= (await adaptDoc(doc, {})).doc; shown = state.adapted; }
  const r = renderDoc(shown, $('p-read'), { profile });
  const v = verifyPreserved(doc, r.text);
  const after = readability(docText(shown)), m = state.metrics;
  const g = $('metrics'); g.replaceChildren();
  g.append(
    card(v.ok ? '✔ Rien de perdu' : '⚠ Éléments manquants', v.ok ? 'Tous les nombres, dates, montants et noms de la page se retrouvent dans l’affichage.' : 'Manquants : ' + v.missing.slice(0, 4).join(', '), v.ok ? 'ok' : 'warn'),
    card(`${m.before.score ?? '—'} → ${after.score ?? '—'}`, 'Lisibilité (indice Kandel-Moles, plus haut = plus facile)'),
    card(`${m.before.avgWords} → ${after.avgWords}`, 'Mots par phrase en moyenne'),
    card(`${m.tokHtml} → ${m.tokMd}`, 'Tokens pour un agent IA : HTML → Markdown'),
    card(String(m.audit.total), "Défauts d'accessibilité courants repérés sur la page d'origine", m.audit.total ? 'warn' : 'ok'),
  );
  document.documentElement.setAttribute('lang', 'fr');
}

function tabs() {
  const sel = (which) => { for (const [t, p] of [['t-read', 'p-read'], ['t-md', 'p-md']]) { const on = (t === which); $(t).setAttribute('aria-selected', String(on)); $(t).tabIndex = on ? 0 : -1; $(p).hidden = !on; } };
  $('t-read').addEventListener('click', () => sel('t-read')); $('t-md').addEventListener('click', () => sel('t-md'));
  document.querySelector('[role=tablist]').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = $('t-read').getAttribute('aria-selected') === 'true' ? 't-md' : 't-read'; sel(next); $(next).focus(); } });
}

function init() {
  tabs();
  $('form').addEventListener('submit', (e) => { e.preventDefault(); const u = $('url').value.trim(); if (!u) return msg('Collez une adresse.', true); load(/^https?:\/\//i.test(u) ? u : 'https://' + u); });
  $('profile').addEventListener('change', () => { state.profile = $('profile').value; paint(); });
  $('smaller').addEventListener('click', () => { state.size = Math.max(0.7, state.size - 0.1); paint(); });
  $('bigger').addEventListener('click', () => { state.size = Math.min(2.2, state.size + 0.1); paint(); });
  $('copy-md').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.md); msg('Markdown copié.'); } catch { msg('Copie impossible.', true); } });
  $('dl-md').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([state.md], { type: 'text/markdown' })); a.download = 'page.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
  $('share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); msg('Lien copié.'); } catch { msg('Copie impossible.', true); } });
  if (EXAMPLES.length) { const p = $('examples'); p.hidden = false; for (const u of EXAMPLES) { const a = document.createElement('a'); a.href = '#u=' + encodeURIComponent(u); a.textContent = new URL(u).hostname; a.addEventListener('click', (e) => { e.preventDefault(); $('url').value = u; load(u); }); p.appendChild(a); } }
  const m = /^#u=(.+)$/.exec(location.hash);
  if (m) { try { const u = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(u)) { $('url').value = u; load(u); } } catch { /* hash invalide */ } }
}
init();
