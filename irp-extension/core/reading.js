/** Utilitaires du lecteur : texte brut, comparaison et préférences bornées. Aucun contenu mémorisé. */
import { VERSION, LIMITS, inlineText } from './doc.js';

export const DEFAULT_READING = Object.freeze({ profile: 'standard', size: 1, font: 'serif', theme: 'sepia', simplify: false });
export const MAX_READING_CHARS = 1_000_000;

/** Parser dans un template inerte : aucun script, événement ou chargement de ressource source.
 * On garde les href/src comme données pour l'extraction, sans les monter dans la page active.
 */
export function parseReadingHtml(html, ownerDocument) {
  const doc = ownerDocument.implementation.createHTMLDocument('');
  const template = doc.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,iframe,object,embed,link,base').forEach((el) => el.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || attr.name === 'srcdoc') el.removeAttribute(attr.name);
  });
  doc.title = template.content.querySelector('title')?.textContent || '';
  const lang = /<html\b[^>]*\blang\s*=\s*["']([a-zA-Z0-9-]{1,20})["']/i.exec(html);
  if (lang) doc.documentElement.lang = lang[1];
  doc.body.replaceChildren(template.content);
  return doc;
}

export function readingPrefs(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    profile: ['standard', 'dyslexie', 'falc', 'basse_vision', 'lecture_nuit'].includes(v.profile) ? v.profile : 'standard',
    size: Number.isFinite(v.size) ? Math.max(0.8, Math.min(1.8, v.size)) : 1,
    font: ['serif', 'lisible', 'systeme'].includes(v.font) ? v.font : 'serif',
    theme: ['standard', 'sepia', 'sombre', 'contrast'].includes(v.theme) ? v.theme : 'sepia',
    simplify: v.simplify === true,
  };
}

/** Le collage est du TEXTE, jamais du HTML implicite. Les fichiers HTML utilisent extractDoc. */
export function fromPlainText(raw, title = '') {
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Collez un texte pour commencer.');
  if (text.length > MAX_READING_CHARS) throw new Error('Ce texte est trop long (maximum 1 million de caractères).');
  const parts = text.split(/\n\s*\n/).filter((p) => p.trim());
  let heading = title;
  if (!heading && parts.length > 1 && !parts[0].includes('\n') && parts[0].length <= 140) heading = parts.shift().replace(/^#\s+/, '');
  return {
    irp_doc: VERSION, lang: 'fr', title: heading || 'Texte collé',
    blocks: parts.flatMap((part) => {
      const heading = /^(#{1,6})\s+([^\n]+)$/.exec(part);
      if (heading) return [{ type: 'heading', level: Math.max(2, heading[1].length), text: heading[2] }];
      const lines = part.split('\n');
      if (lines.every((line) => /^\s*[-•*]\s+/.test(line))) return [{ type: 'list', items: lines.map((l) => l.replace(/^\s*[-•*]\s+/, '')) }];
      const chunks = []; let rest = part;
      while (rest.length > LIMITS.maxString) {
        const cut = Math.max(rest.lastIndexOf(' ', LIMITS.maxString - 1), rest.lastIndexOf('\n', LIMITS.maxString - 1));
        if (cut < 1) throw new Error('Ce texte contient une séquence trop longue sans espace (maximum 20 000 caractères).');
        chunks.push({ type: 'text', text: rest.slice(0, cut + 1) }); rest = rest.slice(cut + 1);
      }
      if (rest) chunks.push({ type: 'text', text: rest });
      return chunks;
    }),
    source: { origin: 'paste' },
  };
}

/** Les deux documents ont la même structure : adaptDoc ne modifie que les champs de texte. */
export function compareReading(original, adapted) {
  const rows = [];
  const add = (a, b, type) => rows.push({ original: inlineText(a || ''), adapted: inlineText(b || ''), type, changed: inlineText(a || '') !== inlineText(b || '') });
  add(original.title, adapted.title, 'title');
  const walk = (a, b) => a.forEach((block, i) => {
    const other = b[i] || block;
    switch (block.type) {
      case 'section': if (block.title) add(block.title, other.title, 'heading'); walk(block.blocks, other.blocks); break;
      case 'list': block.items.forEach((s, n) => add(s, other.items[n], 'list')); break;
      case 'steps': block.items.forEach((s, n) => { if (s.title) add(s.title, other.items[n].title, 'heading'); add(s.text, other.items[n].text, 'text'); }); break;
      case 'facts': block.items.forEach((s, n) => add(s.label + ' : ' + s.value, other.items[n].label + ' : ' + other.items[n].value, 'text')); break;
      case 'table': if (block.caption) add(block.caption, other.caption, 'heading'); if (block.headers?.length) add(block.headers.join(' | '), other.headers.join(' | '), 'text'); block.rows.forEach((r, n) => add(r.map(inlineText).join(' | '), other.rows[n].map(inlineText).join(' | '), 'text')); break;
      case 'image': add(block.alt, other.alt, 'text'); break;
      case 'actions': block.items.forEach((s, n) => add(s.label + ' — ' + s.href, other.items[n].label + ' — ' + other.items[n].href, 'text')); break;
      default: if (block.title) add(block.title, other.title, 'heading'); if (block.text) add(block.text, other.text, block.type); if (block.cite) add(block.cite, other.cite, 'text');
    }
  });
  walk(original.blocks, adapted.blocks);
  return rows;
}

export function readingFilename(title, ext) {
  const stem = String(title).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70).toLowerCase() || 'lecture';
  return stem + '.' + ext;
}
