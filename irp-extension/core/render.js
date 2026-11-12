/**
 * Rendu déterministe d'un IRP-Doc → DOM. Aucune IA, aucun innerHTML : uniquement
 * createElement / textContent / setAttribute avec valeurs validées.
 * Accessibilité « par construction » : landmarks, un seul h1, niveaux de titres sans saut,
 * tableaux avec caption + scope, lien d'évitement, focus visible, langue déclarée.
 */
import { validateDoc, safeHref, safeImgSrc, inlineText, norm, docText } from './doc.js';

export const THEMES = Object.freeze({
  standard: { bg: '#ffffff', fg: '#1a1a1a', muted: '#4a4a4a', link: '#0b5cad', border: '#767676', btnBg: '#0b5cad', btnFg: '#ffffff', calloutBg: '#f3f4f6' },
  contrast: { bg: '#000000', fg: '#ffffff', muted: '#e0e0e0', link: '#ffd400', border: '#ffffff', btnBg: '#ffd400', btnFg: '#000000', calloutBg: '#000000' },
  sombre:   { bg: '#121212', fg: '#e8e8e8', muted: '#c4c4c4', link: '#8ab4f8', border: '#9a9a9a', btnBg: '#8ab4f8', btnFg: '#101010', calloutBg: '#1e1e1e' },
  sepia:    { bg: '#f4ecd8', fg: '#2f2616', muted: '#4d4128', link: '#7a3b00', border: '#6b5d3f', btnBg: '#7a3b00', btnFg: '#ffffff', calloutBg: '#eadfc3' },
});

/** Profils prêts à l'emploi. Les valeurs sont bornées dans resolveProfile (aucune injection CSS possible). */
export const PROFILES = Object.freeze({
  standard: { theme: 'standard', font: 'systeme', size: 1, spacing: 'normal', width: 72 },
  dyslexie: { theme: 'sepia', font: 'lisible', size: 1.15, spacing: 'large', width: 60, falc: false },
  falc:     { theme: 'standard', font: 'lisible', size: 1.2, spacing: 'large', width: 56, falc: true },
  basse_vision: { theme: 'contrast', font: 'lisible', size: 1.6, spacing: 'large', width: 52 },
  lecture_nuit: { theme: 'sombre', font: 'systeme', size: 1.1, spacing: 'normal', width: 66 },
});

const FONTS = {
  systeme: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  // Polices conçues pour la lisibilité ; repli sur Verdana/Tahoma (WCAG: pas de dépendance réseau)
  lisible: '"Atkinson Hyperlegible", Lexend, Verdana, Tahoma, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};
// Espacements >= WCAG 1.4.12 (interligne 1.5, paragraphes 2x, lettres 0.12em, mots 0.16em) pour "large"
const SPACINGS = {
  normal: { lh: 1.6, ls: '0em', ws: '0em', ps: '1em' },
  large: { lh: 1.8, ls: '0.12em', ws: '0.16em', ps: '2em' },
};

const clamp = (n, a, b, d) => (Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d);

export function resolveProfile(p) {
  const base = typeof p === 'string' ? (PROFILES[p] || PROFILES.standard) : { ...PROFILES.standard, ...(p || {}) };
  return {
    theme: THEMES[base.theme] ? base.theme : 'standard',
    font: FONTS[base.font] ? base.font : 'systeme',
    size: clamp(Number(base.size), 0.8, 2.5, 1),
    spacing: SPACINGS[base.spacing] ? base.spacing : 'normal',
    width: clamp(Number(base.width), 30, 120, 72),
    falc: !!base.falc,
  };
}

/** Feuille de style générée à partir de valeurs bornées uniquement (jamais de texte du document). */
export function buildCss(profile) {
  const pr = resolveProfile(profile), t = THEMES[pr.theme], s = SPACINGS[pr.spacing];
  return `
.irp-root{background:${t.bg};color:${t.fg};font-family:${FONTS[pr.font]};font-size:${(pr.size * 100).toFixed(0)}%;line-height:${s.lh};letter-spacing:${s.ls};word-spacing:${s.ws};padding:1.5rem 1rem;box-sizing:border-box}
.irp-root *{box-sizing:border-box}
.irp-root .irp-page{max-width:${pr.width}ch;margin:0 auto}
.irp-root h1,.irp-root h2,.irp-root h3,.irp-root h4,.irp-root h5,.irp-root h6{line-height:1.25;margin:1.6em 0 .6em;overflow-wrap:anywhere}
.irp-root h1{font-size:1.8em;margin-top:.4em}
.irp-root p,.irp-root ul,.irp-root ol,.irp-root dl,.irp-root blockquote,.irp-root pre,.irp-root table,.irp-root figure,.irp-root .irp-callout{margin:0 0 ${s.ps}}
.irp-root p,.irp-root li,.irp-root dd,.irp-root td,.irp-root th{text-align:left;overflow-wrap:anywhere;hyphens:none}
.irp-root li{margin:0 0 .5em}
.irp-root a{color:${t.link};text-decoration:underline;text-underline-offset:.15em}
.irp-root a:focus-visible,.irp-root pre:focus-visible,.irp-root .irp-scroll:focus-visible,.irp-root .irp-skip:focus-visible{outline:3px solid ${t.link};outline-offset:3px}
.irp-root .irp-skip{position:absolute;left:-9999px;top:0;background:${t.bg};color:${t.fg};padding:.5rem 1rem;z-index:10}
.irp-root .irp-skip:focus{left:.5rem;top:.5rem}
.irp-root .irp-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin:0 0 ${s.ps};padding:0;list-style:none}
.irp-root .irp-btn{display:inline-block;min-height:44px;min-width:44px;padding:.6em 1.2em;border:2px solid ${t.btnBg};background:${t.btnBg};color:${t.btnFg};text-decoration:none;font-weight:600;border-radius:6px}
.irp-root .irp-btn.irp-secondary{background:transparent;color:${t.link};border-color:${t.link}}
.irp-root table{border-collapse:collapse;width:100%}
.irp-root caption{text-align:left;font-weight:700;padding:.4em 0}
.irp-root th,.irp-root td{border:1px solid ${t.border};padding:.5em .7em;vertical-align:top}
.irp-root th{text-align:left;font-weight:700}
.irp-root .irp-scroll{overflow-x:auto}
.irp-root blockquote{border-left:4px solid ${t.border};padding:.2em 1em;margin-left:0}
.irp-root cite{display:block;color:${t.muted};font-style:normal}
.irp-root pre{overflow:auto;border:1px solid ${t.border};padding:.8em;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0;word-spacing:0}
.irp-root .irp-callout{border:2px solid ${t.border};border-left-width:8px;background:${t.calloutBg};padding:.8em 1em}
.irp-root .irp-callout-title{font-weight:700;margin:0 0 .3em}
.irp-root dl.irp-facts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:.4em 1.2em}
.irp-root dl.irp-facts dt{font-weight:700;overflow-wrap:anywhere}
.irp-root dl.irp-facts dd{margin:0}
.irp-root ol.irp-steps{padding-left:0;list-style:none;counter-reset:s}
.irp-root ol.irp-steps>li{counter-increment:s;padding-left:2.6em;position:relative}
.irp-root ol.irp-steps>li::before{content:counter(s);position:absolute;left:0;top:0;width:1.9em;height:1.9em;border-radius:50%;background:${t.btnBg};color:${t.btnFg};text-align:center;font-weight:700;line-height:1.9em}
.irp-root .irp-imgph{border:2px dashed ${t.border};padding:.8em 1em;color:${t.muted}}
.irp-root img{max-width:100%;height:auto}
.irp-root .irp-meta{color:${t.muted};font-size:.9em}
@media (prefers-reduced-motion:reduce){.irp-root *{animation:none!important;transition:none!important}}
`.trim();
}

/** Rendu des segments inline. */
function renderInline(d, parent, text, report) {
  if (typeof text === 'string') { parent.appendChild(d.createTextNode(text)); return; }
  for (const r of text || []) {
    if (typeof r === 'string') { parent.appendChild(d.createTextNode(r)); continue; }
    if (r.t === 'a') {
      const href = safeHref(r.href);
      if (href === null) { parent.appendChild(d.createTextNode(r.text)); report.linksDropped++; continue; }
      const a = d.createElement('a'); a.setAttribute('href', href); a.textContent = r.text;
      if (/^https?:/i.test(href)) a.setAttribute('rel', 'noopener noreferrer');
      parent.appendChild(a);
    } else {
      const e = d.createElement(r.t === 'b' ? 'strong' : 'em'); e.textContent = r.text; parent.appendChild(e);
    }
  }
}

/**
 * Rend `doc` dans `container` (remplace son contenu).
 * @param {object} doc IRP-Doc
 * @param {Element} container
 * @param {{profile?: string|object, allowImages?: boolean, embedded?:boolean, idPrefix?:string}} [opts]
 * @returns {{ok:boolean, errors:string[], report:object, text:string}}
 */
export function renderDoc(doc, container, opts = {}) {
  const v = validateDoc(doc);
  const d = container.ownerDocument;
  const report = { linksDropped: 0, imagesBlocked: 0, imagesShown: 0, headingsFixed: 0 };
  if (!v.ok) {
    const box = d.createElement('div'); box.setAttribute('role', 'alert');
    box.textContent = 'Document IRP invalide : ' + v.errors.slice(0, 3).join(' ; ');
    container.replaceChildren(box);
    return { ok: false, errors: v.errors, report, text: '' };
  }
  const profile = resolveProfile(opts.profile);
  const root = d.createElement('div'); root.className = 'irp-root'; root.setAttribute('data-irp-theme', profile.theme);
  if (doc.lang) root.setAttribute('lang', String(doc.lang).slice(0, 20));
  const style = d.createElement('style'); style.textContent = buildCss(profile); root.appendChild(style);

  const prefix = /^[a-z][a-z0-9-]{0,40}$/.test(opts.idPrefix || '') ? opts.idPrefix : 'irp';
  const skip = d.createElement('a'); skip.className = 'irp-skip'; skip.setAttribute('href', '#' + prefix + '-main'); skip.textContent = 'Aller au contenu'; root.appendChild(skip);
  const page = d.createElement('div'); page.className = 'irp-page'; root.appendChild(page);
  const header = d.createElement('header');
  const titleLevel = opts.embedded && opts.titleLevel !== 1 ? 2 : 1;
  const h1 = d.createElement('h' + titleLevel); h1.className = 'irp-title'; h1.textContent = doc.title; header.appendChild(h1);
  if (doc.description) { const p = d.createElement('p'); p.className = 'irp-meta'; p.textContent = doc.description; header.appendChild(p); }
  page.appendChild(header);
  const main = d.createElement(opts.embedded ? 'div' : 'main'); main.id = prefix + '-main'; main.setAttribute('tabindex', '-1'); page.appendChild(main);

  let prevLevel = titleLevel;

  const heading = (parent, level, text) => {
    let lv = Math.max(titleLevel + 1, Math.min(6, level + titleLevel - 1));
    if (lv > prevLevel + 1) { lv = prevLevel + 1; report.headingsFixed++; }
    prevLevel = lv;
    const h = d.createElement('h' + lv); renderInline(d, h, text, report); parent.appendChild(h);
  };

  const block = (b, parent, depth) => {
    switch (b.type) {
      case 'heading': heading(parent, b.level, b.text); break;
      case 'text': { const p = d.createElement('p'); renderInline(d, p, b.text, report); parent.appendChild(p); break; }
      case 'list': { const l = d.createElement(b.ordered ? 'ol' : 'ul');
        for (const it of b.items) { const li = d.createElement('li'); renderInline(d, li, it, report); l.appendChild(li); } parent.appendChild(l); break; }
      case 'steps': { const l = d.createElement('ol'); l.className = 'irp-steps';
        for (const it of b.items) { const li = d.createElement('li');
          if (it.title) { const s = d.createElement('strong'); s.textContent = it.title; li.appendChild(s); li.appendChild(d.createElement('br')); }
          renderInline(d, li, it.text || '', report); l.appendChild(li); } parent.appendChild(l); break; }
      case 'quote': { const q = d.createElement('blockquote'); const p = d.createElement('p'); renderInline(d, p, b.text, report); q.appendChild(p);
        if (b.cite) { const c = d.createElement('cite'); c.textContent = b.cite; q.appendChild(c); } parent.appendChild(q); break; }
      case 'code': { const pre = d.createElement('pre'); pre.tabIndex = 0; const c = d.createElement('code'); c.textContent = b.text; pre.appendChild(c); parent.appendChild(pre); break; }
      case 'callout': { const c = d.createElement('div'); c.className = 'irp-callout irp-' + (b.kind || 'info');
        c.setAttribute('role', b.kind === 'danger' || b.kind === 'warning' ? 'alert' : 'note');
        if (b.title) { const t = d.createElement('p'); t.className = 'irp-callout-title'; t.textContent = b.title; c.appendChild(t); }
        const p = d.createElement('p'); renderInline(d, p, b.text, report); c.appendChild(p); parent.appendChild(c); break; }
      case 'facts': { const dl = d.createElement('dl'); dl.className = 'irp-facts';
        for (const it of b.items) { const dt = d.createElement('dt'); dt.textContent = it.label; const dd = d.createElement('dd'); dd.textContent = it.value; dl.append(dt, dd); } parent.appendChild(dl); break; }
      case 'actions': { const ul = d.createElement('ul'); ul.className = 'irp-actions';
        b.items.forEach((it, i) => { const li = d.createElement('li'); const a = d.createElement('a');
          a.className = 'irp-btn' + (it.primary || (i === 0 && it.primary === undefined) ? '' : ' irp-secondary');
          a.setAttribute('href', safeHref(it.href)); a.textContent = it.label; if (/^https?:/i.test(it.href)) a.setAttribute('rel', 'noopener noreferrer');
          li.appendChild(a); ul.appendChild(li); }); parent.appendChild(ul); break; }
      case 'table': { const wrap = d.createElement('div'); wrap.className = 'irp-scroll'; wrap.setAttribute('role', 'region'); wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('aria-label', b.caption || 'Tableau'); const t = d.createElement('table');
        if (b.caption) { const c = d.createElement('caption'); c.textContent = b.caption; t.appendChild(c); }
        if (b.headers && b.headers.length) { const tr = d.createElement('tr'); for (const h of b.headers) { const th = d.createElement('th'); th.setAttribute('scope', 'col'); th.textContent = h; tr.appendChild(th); }
          const thead = d.createElement('thead'); thead.appendChild(tr); t.appendChild(thead); }
        const tb = d.createElement('tbody');
        for (const r of b.rows || []) { const tr = d.createElement('tr'); for (const c of r) { const td = d.createElement('td'); renderInline(d, td, c, report); tr.appendChild(td); } tb.appendChild(tr); }
        t.appendChild(tb); wrap.appendChild(t); parent.appendChild(wrap); break; }
      case 'image': {
        const fig = d.createElement('figure'); const src = opts.allowImages ? safeImgSrc(b.src) : null;
        if (src && b.alt !== undefined) { const img = d.createElement('img'); img.setAttribute('src', src); img.setAttribute('alt', b.alt || ''); img.setAttribute('loading', 'lazy'); img.setAttribute('referrerpolicy', 'no-referrer'); fig.appendChild(img); report.imagesShown++; }
        else { const ph = d.createElement('div'); ph.className = 'irp-imgph'; ph.setAttribute('role', 'img');
          ph.setAttribute('aria-label', b.alt ? 'Image : ' + b.alt : 'Image sans description'); ph.textContent = b.alt ? 'Image : ' + b.alt : 'Image sans description'; fig.appendChild(ph); report.imagesBlocked++; }
        parent.appendChild(fig); break; }
      case 'section': { const sec = d.createElement('section');
        if (b.title) { const save = prevLevel; heading(sec, Math.min(6, depth + 2), b.title); const h = sec.lastChild; sec.setAttribute('aria-labelledby', (h.id = 'irp-h-' + (report.headingsFixed + sec.childNodes.length + Math.random().toString(36).slice(2, 7)))); void save; }
        for (const x of b.blocks) block(x, sec, depth + 1); parent.appendChild(sec); break; }
    }
  };
  for (const b of doc.blocks) block(b, main, 0);

  container.replaceChildren(root);
  return { ok: true, errors: [], report, text: visibleText(root) };
}

/** Rend le texte visible tel qu'affiché (sans le <style>) — pour la vérification de contrat. */
export function visibleText(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('style,script').forEach((n) => n.remove());
  // textContent seul colle les cellules/titres : « 50 » et « 20 » deviennent « 5020 ».
  clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,li,dt,dd,tr,td,th,pre,br').forEach((n) => {
    n.before(clone.ownerDocument.createTextNode(' ')); n.after(clone.ownerDocument.createTextNode(' '));
  });
  return norm(clone.textContent);
}

export { docText };
