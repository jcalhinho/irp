/**
 * Extraction : page HTML existante → IRP-Doc. Fonctionne dans le navigateur (extension)
 * et sous jsdom (benchmark). Lecture seule : ne modifie jamais la page source (travaille sur un clone).
 * Le HTML source est traité comme hostile : seul du texte et des URLs validées en sortent.
 */
import { safeHref, safeImgSrc, norm, VERSION } from './doc.js';

const DROP_TAGS = 'script,style,noscript,template,iframe,object,embed,canvas,svg,form,button,input,select,textarea,dialog,link,meta,audio,video';
const DROP_ROLES = '[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[role=search],[role=dialog],[aria-hidden=true],[hidden]';
const NOISE = /(?:^|[-_\s])(nav|navbar|menu|cookie|cookies|consent|gdpr|banner|ad|ads|advert|sponsor|promo|sidebar|share|social|newsletter|popup|modal|breadcrumb|breadcrumbs|footer|comment|comments|related|skip|toolbar)(?:[-_\s]|$)/i;

const txt = (s) => norm(s || '');

function resolve(href, base) {
  try { return safeHref(new URL(href, base || undefined).href); } catch { return base ? null : safeHref(href); }
}

function inlineRuns(node, base, out = []) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) { const t = ch.nodeValue.replace(/\s+/g, ' '); if (t) out.push(t); continue; }
    if (ch.nodeType !== 1) continue;
    const tag = ch.tagName.toLowerCase();
    if (tag === 'br') { out.push(' '); continue; }
    if (tag === 'a') {
      const text = txt(ch.textContent); const href = ch.getAttribute('href');
      const h = href && !href.startsWith('#') ? resolve(href, base) : null;
      if (text && h) out.push({ t: 'a', href: h, text }); else if (text) out.push(text);
      continue;
    }
    if (tag === 'strong' || tag === 'b') { const t = txt(ch.textContent); if (t) out.push({ t: 'b', text: t }); continue; }
    if (tag === 'em' || tag === 'i') { const t = txt(ch.textContent); if (t) out.push({ t: 'em', text: t }); continue; }
    inlineRuns(ch, base, out);
  }
  return out;
}

/** Normalise une liste de segments : fusionne les chaînes, trim, renvoie string si pas de formatage. */
function packRuns(runs) {
  const merged = [];
  for (const r of runs) {
    if (typeof r === 'string' && typeof merged[merged.length - 1] === 'string') merged[merged.length - 1] += r; else merged.push(r);
  }
  if (typeof merged[0] === 'string') merged[0] = merged[0].replace(/^\s+/, '');
  if (typeof merged[merged.length - 1] === 'string') merged[merged.length - 1] = merged[merged.length - 1].replace(/\s+$/, '');
  const cleaned = merged.filter((r) => typeof r !== 'string' || r !== '');
  if (!cleaned.length) return '';
  return cleaned.every((r) => typeof r === 'string') ? cleaned.join('') : cleaned;
}
const inlineOf = (el, base) => packRuns(inlineRuns(el, base));
const plainLen = (x) => (typeof x === 'string' ? x : x.map((r) => (typeof r === 'string' ? r : r.text)).join('')).length;

function isNoise(el) {
  const sig = `${el.getAttribute('class') || ''} ${el.id || ''}`;
  return sig.length < 200 && NOISE.test(sig);
}

function pickRoot(body) {
  const main = body.querySelector('main, [role=main]');
  if (main && txt(main.textContent).length > 200) return { el: main, how: 'main' };
  const arts = [...body.querySelectorAll('article')].filter((a) => txt(a.textContent).length > 200);
  if (arts.length === 1) return { el: arts[0], how: 'article' };
  // score façon Readability : paragraphes substantiels attribués au parent et au grand-parent
  const scores = new Map();
  for (const p of body.querySelectorAll('p, li, td, blockquote, pre')) {
    const len = txt(p.textContent).length; if (len < 40) continue;
    const par = p.parentElement, gp = par && par.parentElement;
    if (par) scores.set(par, (scores.get(par) || 0) + len);
    if (gp && gp !== body) scores.set(gp, (scores.get(gp) || 0) + len / 2);
  }
  let best = null, bs = 0;
  for (const [el, s] of scores) {
    const links = [...el.querySelectorAll('a')].reduce((a, x) => a + txt(x.textContent).length, 0);
    const total = txt(el.textContent).length || 1;
    const sc = s * (1 - Math.min(0.9, links / total));
    if (sc > bs) { bs = sc; best = el; }
  }
  if (!best) return { el: body, how: 'body' };
  // Le conteneur le plus dense n'est souvent que le bloc de paragraphes : titre, prix, tableau, liste
  // sont ses frères. On remonte tant que le parent n'ajoute pas massivement d'autre contenu (nav/pubs/commentaires déjà retirés).
  const linkRatio = (el) => [...el.querySelectorAll('a')].reduce((a, x) => a + txt(x.textContent).length, 0) / (txt(el.textContent).length || 1);
  for (let i = 0; i < 3; i++) {
    const par = best.parentElement;
    if (!par || par === body || /^(html|body)$/i.test(par.tagName)) break;
    const bl = txt(best.textContent).length, pl = txt(par.textContent).length;
    if (pl <= bl * 2.2 + 400 && linkRatio(par) < 0.35) best = par; else break;
  }
  return { el: best, how: 'score' };
}

/**
 * @param {Document} document
 * @param {{url?:string, mustShow?:string[]}} [opts]
 * @returns {{doc:object, report:object}}
 */
export function extractDoc(document, opts = {}) {
  const base = opts.url || document.URL || '';
  const body = document.body ? document.body.cloneNode(true) : document.documentElement.cloneNode(true);
  const report = { root: '', blocks: 0, imagesNoAlt: 0, tablesFlattened: 0, dropped: 0 };

  body.querySelectorAll(DROP_TAGS).forEach((n) => n.remove());
  body.querySelectorAll(DROP_ROLES).forEach((n) => n.remove());
  body.querySelectorAll('nav, aside, footer').forEach((n) => n.remove());
  body.querySelectorAll('header').forEach((h) => { if (!h.closest('article, main, section')) h.remove(); });
  body.querySelectorAll('*').forEach((n) => { if (n.isConnected && isNoise(n) && !/^(html|body|main|article)$/i.test(n.tagName)) { report.dropped++; n.remove(); } });

  const { el: root, how } = pickRoot(body);
  report.root = how;

  const blocks = [];
  let title = '';
  const push = (b) => { blocks.push(b); };

  const walk = (el, out) => {
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) { const t = txt(ch.nodeValue); if (t.length > 20) out.push({ type: 'text', text: t }); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = inlineOf(ch, base); if (!plainLen(t)) continue;
        const lv = Number(tag[1]);
        if (lv === 1 && !title) { title = txt(ch.textContent); continue; }
        out.push({ type: 'heading', level: lv === 1 ? 2 : lv, text: typeof t === 'string' ? t : txt(ch.textContent) });
      } else if (tag === 'p') {
        const t = inlineOf(ch, base); if (plainLen(t)) out.push({ type: 'text', text: t });
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [...ch.children].filter((c) => c.tagName === 'LI').map((li) => inlineOf(li, base)).filter((x) => plainLen(x));
        if (items.length) out.push({ type: 'list', ordered: tag === 'ol', items });
      } else if (tag === 'dl') {
        const items = []; let lab = '';
        for (const c of ch.children) { if (c.tagName === 'DT') lab = txt(c.textContent); else if (c.tagName === 'DD' && lab) { items.push({ label: lab, value: txt(c.textContent) }); } }
        if (items.length) out.push({ type: 'facts', items });
      } else if (tag === 'table') {
        const rows = [...ch.querySelectorAll('tr')];
        const nested = ch.querySelector('table table, table > tbody > tr > td > table');
        const ths = [...ch.querySelectorAll('th')];
        if (nested || !rows.length) { report.tablesFlattened++; walk(ch, out); continue; }
        let headers = [], bodyRows = rows;
        const first = rows[0], fth = [...first.children].filter((c) => c.tagName === 'TH');
        if (fth.length && fth.length === first.children.length) { headers = fth.map((c) => txt(c.textContent)); bodyRows = rows.slice(1); }
        else if (ths.length === 0 && rows.every((r) => r.children.length === 1)) { report.tablesFlattened++; walk(ch, out); continue; }
        const data = bodyRows.map((r) => [...r.children].map((c) => inlineOf(c, base))).filter((r) => r.length && r.some((c) => plainLen(c)));
        if (data.length) { const cap = ch.querySelector('caption'); out.push({ type: 'table', ...(cap ? { caption: txt(cap.textContent) } : {}), headers, rows: data }); }
      } else if (tag === 'blockquote') {
        const t = inlineOf(ch, base); if (plainLen(t)) out.push({ type: 'quote', text: t });
      } else if (tag === 'pre') {
        const t = ch.textContent.replace(/\s+$/, ''); if (t.trim()) out.push({ type: 'code', text: t.slice(0, 20000) });
      } else if (tag === 'img' || tag === 'picture') {
        const img = tag === 'img' ? ch : ch.querySelector('img'); if (!img) continue;
        const alt = txt(img.getAttribute('alt') || '');
        const src = img.getAttribute('src'); let abs = null; try { abs = src ? safeImgSrc(new URL(src, base || undefined).href) : null; } catch { abs = null; }
        if (img.hasAttribute('alt') && alt === '') continue; // décorative déclarée : on l'ignore
        if (!alt) report.imagesNoAlt++;
        out.push({ type: 'image', alt, ...(abs ? { src: abs } : {}) });
      } else if (tag === 'figure') {
        walk(ch, out);
        const cap = ch.querySelector('figcaption'); void cap;
      } else if (tag === 'figcaption') {
        const t = inlineOf(ch, base); if (plainLen(t)) out.push({ type: 'text', text: t });
      } else {
        // conteneur générique : on descend ; texte inline orphelin (div avec span/a) → paragraphe
        const hasBlock = ch.querySelector('p,ul,ol,table,h1,h2,h3,h4,h5,h6,blockquote,pre,dl,figure,img,div,section,article');
        if (!hasBlock) { const t = inlineOf(ch, base); if (plainLen(t) > 0) out.push({ type: 'text', text: t }); }
        else walk(ch, out);
      }
    }
  };
  walk(root, blocks);

  if (!title) title = txt((document.title || '').split(/\s[|–—]\s/)[0]) || (blocks.find((b) => b.type === 'heading') || {}).text || 'Page';
  if (typeof title !== 'string') title = 'Page';
  // dé-doublonnage des paragraphes consécutifs identiques (menus répétés, etc.)
  const dedup = blocks.filter((b, i) => !(i && b.type === 'text' && blocks[i - 1].type === 'text' && JSON.stringify(b) === JSON.stringify(blocks[i - 1])));
  report.blocks = dedup.length;

  const lang = (document.documentElement && document.documentElement.getAttribute('lang')) || 'fr';
  const doc = {
    irp_doc: VERSION, lang: lang.slice(0, 20), title: title.slice(0, 500),
    ...(base ? { url: String(base).slice(0, 4096) } : {}),
    blocks: dedup.slice(0, 5000),
    ...(opts.mustShow && opts.mustShow.length ? { must_show: opts.mustShow } : {}),
    source: { origin: 'extraction', extractor: 'irp-core/extract.js', root: how },
  };
  return { doc, report };
}
