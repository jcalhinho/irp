// doc-mode.js — Mode déterministe du client IRP : aucune IA requise, rendu identique à chaque visite.
// Le serveur publie un IRP-Doc (composants JSON) ; le client le rend avec le profil de l'utilisateur.
// Si un LLM est disponible, il ne peut qu'adapter du texte (et sa sortie est vérifiée), jamais produire du HTML.
import { renderDoc, adaptDoc, verifyPreserved, THEMES, resolveProfile } from './core/index.js';

const PROFILES = [['standard', 'Standard'], ['dyslexie', 'Dyslexie'], ['falc', 'Langage simplifié (FALC)'], ['basse_vision', 'Basse vision'], ['lecture_nuit', 'Lecture de nuit']];
const KEY = 'irp-doc-prefs';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* stockage indisponible : sans conséquence */ } };

export async function runDocMode({ server, path, rootId = 'irp-root' }) {
  const root = document.getElementById(rootId);
  const prefs = { profile: 'standard', size: 1, simplify: false, ...load() };
  let current = null, adapted = null, currentPath = path;

  document.documentElement.lang = 'fr';
  const bar = document.createElement('div');
  bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Options de lecture');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem 1rem;background:#111;color:#fff;font:15px system-ui,sans-serif';
  const mk = (tag, text, attrs = {}) => { const e = document.createElement(tag); e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const sel = mk('select', '', { 'aria-label': "Profil d'affichage", id: 'irp-profile' });
  for (const [v, t] of PROFILES) { const o = mk('option', t, { value: v }); if (v === prefs.profile) o.selected = true; sel.appendChild(o); }
  const lab = mk('label', 'Profil', { for: 'irp-profile' });
  const minus = mk('button', 'A−', { type: 'button', 'aria-label': 'Réduire le texte' });
  const plus = mk('button', 'A+', { type: 'button', 'aria-label': 'Agrandir le texte' });
  const simp = mk('button', 'Texte simplifié', { type: 'button', 'aria-pressed': String(prefs.simplify) });
  const md = mk('a', 'Version Markdown (agents)', { href: '#' });
  const badge = mk('span', '', { role: 'status' });
  for (const b of [sel, minus, plus, simp]) b.style.cssText = 'min-height:44px;padding:.3rem .8rem;font:inherit';
  bar.append(lab, sel, minus, plus, simp, md, badge);
  root.parentNode.insertBefore(bar, root);

  async function fetchDoc(p) {
    const url = server + (p === '/' ? '/index' : p.replace(/\/$/, '')) + '.irpdoc.json';
    const res = await fetch(url, { headers: { Accept: 'application/irp-doc+json' } });
    if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function paint() {
    const profile = { ...resolveProfile(prefs.profile), size: resolveProfile(prefs.profile).size * prefs.size };
    let shown = current;
    if (prefs.simplify) { adapted ||= (await adaptDoc(current, {})).doc; shown = adapted; }
    const r = renderDoc(shown, root, { profile });
    document.body.style.margin = '0'; document.body.style.background = THEMES[profile.theme].bg;
    if (r.ok) { const v = verifyPreserved(current, r.text); badge.textContent = v.ok ? '✔ Nombres, dates et noms conservés' : '⚠ Éléments manquants'; }
    simp.setAttribute('aria-pressed', String(prefs.simplify));
    md.setAttribute('href', server + (currentPath === '/' ? '/index' : currentPath) + '.md');
    document.title = current.title;
  }

  async function go(p, push = true) {
    try { current = await fetchDoc(p); } catch (e) { root.textContent = 'Serveur injoignable : ' + e.message; return; }
    adapted = null; currentPath = p;
    if (push && location.pathname !== p) history.pushState({}, '', p);
    await paint();
    window.scrollTo(0, 0);
  }

  sel.addEventListener('change', () => { prefs.profile = sel.value; if (prefs.profile === 'falc') prefs.simplify = true; save(prefs); paint(); });
  minus.addEventListener('click', () => { prefs.size = Math.max(0.7, prefs.size - 0.1); save(prefs); paint(); });
  plus.addEventListener('click', () => { prefs.size = Math.min(2.2, prefs.size + 0.1); save(prefs); paint(); });
  simp.addEventListener('click', () => { prefs.simplify = !prefs.simplify; save(prefs); paint(); });
  root.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.classList.contains('irp-skip') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) { e.preventDefault(); go(href.split('?')[0].split('#')[0]); }
  });
  window.addEventListener('popstate', () => go(location.pathname, false));
  await go(path, false);
}
