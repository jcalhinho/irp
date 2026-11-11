/**
 * IRP-Doc 1.0 — document de composants (JSON), sans HTML libre.
 * ------------------------------------------------------------------
 * Le serveur (ou l'extracteur) décrit CE QUE contient la page ; le client décide
 * COMMENT l'afficher (profil d'accessibilité) via un rendu déterministe.
 * L'IA, quand elle intervient, ne reformule que du texte (voir simplify.js) et
 * ne peut jamais produire de balises : la surface d'attaque XSS est nulle par construction.
 *
 *   { irp_doc: "1.0", lang, title, url?, description?, must_show?: string[],
 *     blocks: Block[], structured?: object }
 *
 * Texte « inline » : string | Array<string | {t:'a',href,text} | {t:'b',text} | {t:'em',text}>
 */

export const VERSION = '1.0';

export const LIMITS = Object.freeze({
  maxBlocks: 5000, maxDepth: 6, maxString: 20000, maxRuns: 200, maxCells: 20000, maxItems: 2000,
});

export const BLOCK_TYPES = Object.freeze([
  'heading', 'text', 'list', 'table', 'image', 'quote', 'code', 'callout', 'steps', 'facts', 'actions', 'section',
]);
export const CALLOUT_KINDS = Object.freeze(['info', 'warning', 'success', 'danger']);


// Classes de caractères construites à l'exécution (évite tout caractère invisible dans le source).
const cls = (ranges) => new RegExp('[' + ranges.map(([a, b]) => String.fromCharCode(a) + (b ? '-' + String.fromCharCode(b) : '')).join('') + ']', 'g');
/** Contrôles, espaces et caractères invisibles que les navigateurs ignorent dans un schéma d'URL. */
const INVISIBLE = cls([[0, 32], [127, 159], [0x200b, 0x200f], [0x2028, 0x2029], [0xfeff]]);
const NBSP = cls([[0xa0], [0x202f], [0x2009]]);

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** URL autorisée dans un lien : http(s), mailto, tel, relatif, ancre. Jamais javascript:/data:/vbscript:. */
export function safeHref(href) {
  if (!isStr(href)) return null;
  const h = href.trim();
  if (!h || h.length > 4096) return null;
  // retire les caractères de contrôle que les navigateurs ignorent dans le schéma (java\tscript:)
  const probe = h.replace(INVISIBLE, '');
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(probe);
  if (m) return ['http', 'https', 'mailto', 'tel'].includes(m[1].toLowerCase()) ? h : null;
  if (probe.startsWith('//')) return null; // protocole relatif : ambigu, refusé
  return h;
}

/** Image autorisée : https ou chemin relatif (jamais data:/javascript:/http clair). */
export function safeImgSrc(src) {
  if (!isStr(src)) return null;
  const s = src.trim();
  const probe = s.replace(INVISIBLE, '');
  if (!probe || probe.length > 4096) return null;
  if (/^https:\/\//i.test(probe)) return s;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(probe) || probe.startsWith('//')) return null;
  return s;
}

/** Texte brut d'un champ inline. */
export function inlineText(t) {
  if (isStr(t)) return t;
  if (!Array.isArray(t)) return '';
  return t.map((r) => (isStr(r) ? r : isObj(r) && isStr(r.text) ? r.text : '')).join('');
}

/** Texte brut d'un bloc (pour vérifications, exports agents, mesures). */
export function blockText(b) {
  if (!isObj(b)) return '';
  switch (b.type) {
    case 'heading': case 'text': case 'code': return inlineText(b.text);
    case 'quote': return [inlineText(b.text), b.cite || ''].join(' ').trim();
    case 'callout': return [b.title || '', inlineText(b.text)].join(' ').trim();
    case 'list': return (b.items || []).map(inlineText).join('\n');
    case 'steps': return (b.items || []).map((i) => [i.title || '', inlineText(i.text)].join(' ').trim()).join('\n');
    case 'facts': return (b.items || []).map((i) => `${i.label}: ${i.value}`).join('\n');
    case 'actions': return (b.items || []).map((i) => i.label).join('\n');
    case 'table': return [b.caption || '', (b.headers || []).join(' | '), ...(b.rows || []).map((r) => r.map(inlineText).join(' | '))].join('\n');
    case 'image': return b.alt || '';
    case 'section': return [b.title || '', ...(b.blocks || []).map(blockText)].join('\n');
    default: return '';
  }
}

export function docText(doc) {
  return [doc.title || '', doc.description || '', ...(doc.blocks || []).map(blockText)].join('\n');
}

/** Normalisation pour comparaison : espaces insécables/fines → espace, casse conservée sauf option. */
export function norm(s, { lower = false } = {}) {
  let o = String(s).replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
  return lower ? o.toLowerCase() : o;
}

/**
 * Valide un document. Retourne { ok, errors[] } — ne lève jamais.
 * Strict : type inconnu, champ de mauvais type, dépassement de limite ⇒ erreur.
 */
export function validateDoc(doc) {
  const errors = [];
  const err = (p, m) => { if (errors.length < 50) errors.push(`${p}: ${m}`); };
  let blocks = 0, cells = 0;

  const str = (p, v, { req = false, max = LIMITS.maxString } = {}) => {
    if (v === undefined || v === null) { if (req) err(p, 'requis'); return; }
    if (!isStr(v)) return err(p, 'doit être une chaîne');
    if (v.length > max) err(p, `trop long (> ${max})`);
  };
  const inline = (p, v, req = true) => {
    if (v === undefined || v === null) { if (req) err(p, 'requis'); return; }
    if (isStr(v)) return str(p, v);
    if (!Array.isArray(v)) return err(p, 'texte inline invalide');
    if (v.length > LIMITS.maxRuns) return err(p, 'trop de segments');
    v.forEach((r, i) => {
      if (isStr(r)) return str(`${p}[${i}]`, r);
      if (!isObj(r)) return err(`${p}[${i}]`, 'segment invalide');
      if (!['a', 'b', 'em'].includes(r.t)) return err(`${p}[${i}].t`, `type de segment inconnu: ${r.t}`);
      str(`${p}[${i}].text`, r.text, { req: true });
      if (r.t === 'a' && safeHref(r.href) === null) err(`${p}[${i}].href`, 'URL non autorisée');
    });
  };
  const arr = (p, v, max = LIMITS.maxItems) => {
    if (!Array.isArray(v)) { err(p, 'doit être un tableau'); return null; }
    if (v.length > max) { err(p, `trop d'éléments (> ${max})`); return null; }
    return v;
  };

  const block = (b, p, depth) => {
    if (++blocks > LIMITS.maxBlocks) return err(p, 'trop de blocs');
    if (depth > LIMITS.maxDepth) return err(p, 'imbrication trop profonde');
    if (!isObj(b)) return err(p, 'bloc invalide');
    if (!BLOCK_TYPES.includes(b.type)) return err(`${p}.type`, `inconnu: ${b.type}`);
    if (b.id !== undefined) str(`${p}.id`, b.id, { max: 100 });
    switch (b.type) {
      case 'heading':
        if (!Number.isInteger(b.level) || b.level < 1 || b.level > 6) err(`${p}.level`, 'entier 1..6');
        inline(`${p}.text`, b.text); break;
      case 'text': case 'code': (b.type === 'code' ? str : inline)(`${p}.text`, b.text, { req: true }); break;
      case 'quote': inline(`${p}.text`, b.text); str(`${p}.cite`, b.cite); break;
      case 'callout':
        if (b.kind !== undefined && !CALLOUT_KINDS.includes(b.kind)) err(`${p}.kind`, 'inconnu');
        str(`${p}.title`, b.title); inline(`${p}.text`, b.text); break;
      case 'list': { const it = arr(`${p}.items`, b.items); it && it.forEach((x, i) => inline(`${p}.items[${i}]`, x)); break; }
      case 'steps': { const it = arr(`${p}.items`, b.items); it && it.forEach((x, i) => {
        if (!isObj(x)) return err(`${p}.items[${i}]`, 'objet requis'); str(`${p}.items[${i}].title`, x.title); inline(`${p}.items[${i}].text`, x.text); }); break; }
      case 'facts': { const it = arr(`${p}.items`, b.items); it && it.forEach((x, i) => {
        if (!isObj(x)) return err(`${p}.items[${i}]`, 'objet requis');
        str(`${p}.items[${i}].label`, x.label, { req: true }); str(`${p}.items[${i}].value`, x.value, { req: true }); }); break; }
      case 'actions': { const it = arr(`${p}.items`, b.items); it && it.forEach((x, i) => {
        if (!isObj(x)) return err(`${p}.items[${i}]`, 'objet requis');
        str(`${p}.items[${i}].label`, x.label, { req: true });
        if (safeHref(x.href) === null) err(`${p}.items[${i}].href`, 'URL non autorisée'); }); break; }
      case 'table': {
        str(`${p}.caption`, b.caption);
        const h = arr(`${p}.headers`, b.headers); h && h.forEach((x, i) => str(`${p}.headers[${i}]`, x));
        const rows = arr(`${p}.rows`, b.rows);
        rows && rows.forEach((r, i) => {
          const rr = arr(`${p}.rows[${i}]`, r, 200); if (!rr) return;
          cells += rr.length; if (cells > LIMITS.maxCells) return err(p, 'trop de cellules');
          rr.forEach((c, j) => inline(`${p}.rows[${i}][${j}]`, c));
        });
        break; }
      case 'image': str(`${p}.alt`, b.alt); str(`${p}.src`, b.src); break;
      case 'section': str(`${p}.title`, b.title);
        { const bl = arr(`${p}.blocks`, b.blocks); bl && bl.forEach((x, i) => block(x, `${p}.blocks[${i}]`, depth + 1)); } break;
    }
  };

  if (!isObj(doc)) return { ok: false, errors: ['doc: objet requis'] };
  if (doc.irp_doc !== VERSION) err('irp_doc', `doit valoir "${VERSION}"`);
  str('title', doc.title, { req: true, max: 500 });
  str('lang', doc.lang, { max: 20 });
  str('url', doc.url, { max: 4096 });
  str('description', doc.description);
  if (doc.must_show !== undefined) { const m = arr('must_show', doc.must_show, 200); m && m.forEach((x, i) => str(`must_show[${i}]`, x, { req: true, max: 500 })); }
  const bl = arr('blocks', doc.blocks, LIMITS.maxBlocks);
  bl && bl.forEach((b, i) => block(b, `blocks[${i}]`, 0));
  return { ok: errors.length === 0, errors };
}
