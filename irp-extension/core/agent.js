/**
 * Vue « agent » d'un IRP-Doc : le MÊME document qui sert l'interface humaine est lisible par
 * un agent IA, sans scraping ni HTML. Markdown compact (≈ 10x moins de tokens que le HTML d'origine).
 */
import { inlineText } from './doc.js';

const md = (t) => {
  if (typeof t === 'string') return t;
  return (t || []).map((r) => typeof r === 'string' ? r : r.t === 'a' ? `[${r.text}](${r.href})` : r.t === 'b' ? `**${r.text}**` : `*${r.text}*`).join('');
};
const cell = (c) => md(c).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(doc) {
  const out = [`# ${doc.title}`];
  if (doc.description) out.push('', `> ${doc.description}`);
  const blk = (b, depth) => {
    switch (b.type) {
      case 'heading': out.push('', `${'#'.repeat(Math.min(6, Math.max(2, b.level)))} ${md(b.text)}`); break;
      case 'text': out.push('', md(b.text)); break;
      case 'list': out.push(''); b.items.forEach((i, n) => out.push(`${b.ordered ? `${n + 1}.` : '-'} ${md(i)}`)); break;
      case 'steps': out.push(''); b.items.forEach((i, n) => out.push(`${n + 1}. ${i.title ? `**${i.title}** — ` : ''}${md(i.text || '')}`)); break;
      case 'quote': out.push('', `> ${md(b.text)}${b.cite ? ` — ${b.cite}` : ''}`); break;
      case 'code': out.push('', '```', b.text, '```'); break;
      case 'callout': out.push('', `> **${(b.kind || 'info').toUpperCase()}**${b.title ? ` ${b.title}` : ''} : ${md(b.text)}`); break;
      case 'facts': out.push(''); b.items.forEach((i) => out.push(`- **${i.label}** : ${i.value}`)); break;
      case 'actions': out.push(''); b.items.forEach((i) => out.push(`- [${i.label}](${i.href})`)); break;
      case 'table': {
        out.push(''); if (b.caption) out.push(`**${b.caption}**`, '');
        const h = b.headers && b.headers.length ? b.headers : (b.rows[0] || []).map((_, i) => `Col ${i + 1}`);
        out.push(`| ${h.map(cell).join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`);
        b.rows.forEach((r) => out.push(`| ${r.map(cell).join(' | ')} |`)); break; }
      case 'image': out.push('', `![${b.alt || ''}](${b.src || ''})`.replace('()', '')); break;
      case 'section': if (b.title) out.push('', `${'#'.repeat(Math.min(6, depth + 2))} ${b.title}`); b.blocks.forEach((x) => blk(x, depth + 1)); break;
    }
  };
  doc.blocks.forEach((b) => blk(b, 0));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Estimation grossière du nombre de tokens (≈ 4 caractères / token). */
export const approxTokens = (s) => Math.ceil(String(s).length / 4);

/** Entrée d'index /llms.txt pour une page. */
export function llmsEntry(doc, href) {
  return `- [${doc.title}](${href})${doc.description ? `: ${inlineText(doc.description)}` : ''}`;
}
