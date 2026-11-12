/**
 * Simplification de texte français « pré-FALC » + garde-fous.
 * ------------------------------------------------------------------
 * - Règles déterministes (phrases courtes, vocabulaire courant) : reproductibles, auditables.
 * - Un adaptateur IA optionnel (LLM local ou distant) peut reformuler, mais sa sortie est
 *   REFUSÉE si elle perd un nombre, une date, un montant, une URL, un e-mail ou un nom propre :
 *   on retombe alors sur le texte original. L'IA n'a jamais le dernier mot.
 * Ce n'est PAS un FALC certifié : un vrai FALC est relu par des personnes en situation de
 * handicap intellectuel. C'est une aide de lecture, présentée comme telle.
 */
import { inlineText, norm } from './doc.js';

// ── Lisibilité ────────────────────────────────────────────────────────────────
/** Nombre de syllabes d'un mot français (heuristique : groupes de voyelles, « e » final muet). */
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿœæç]/g, '');
  if (!w) return 0;
  w = w.replace(/(?:es|e|ent)$/, (m) => (w.length > m.length + 1 ? '' : m));
  const g = w.match(/[aeiouyàâäéèêëîïôöùûüÿœæ]+/g);
  return Math.max(1, g ? g.length : 1);
}

export function splitSentences(text) {
  const abbr = /\b(?:M|Mme|Mlle|Dr|Pr|St|Ste|cf|etc|env|art|n°|p|tel|vs)\.$/i;
  const raw = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"“(\d])/);
  const out = [];
  for (const s of raw) {
    if (out.length && abbr.test(out[out.length - 1])) out[out.length - 1] += ' ' + s; else out.push(s);
  }
  return out.filter(Boolean);
}

/** Indice de Kandel & Moles (adaptation française de Flesch) : plus c'est haut, plus c'est facile. */
export function readability(text) {
  const sents = splitSentences(text);
  const words = (String(text).match(/[A-Za-zÀ-ÿŒœ'’-]+/g) || []).filter((w) => /[A-Za-zÀ-ÿ]/.test(w));
  if (!sents.length || !words.length) return { score: null, sentences: sents.length, words: words.length, avgWords: 0, longSentences: 0 };
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const asl = words.length / sents.length, asw = syl / words.length;
  const score = Math.round((207 - 1.015 * asl - 73.6 * asw) * 10) / 10;
  const longSentences = sents.filter((s) => (s.match(/\S+/g) || []).length > 20).length;
  return { score, sentences: sents.length, words: words.length, avgWords: Math.round(asl * 10) / 10, longSentences };
}

// ── Règles ────────────────────────────────────────────────────────────────────
const LEXICON = [
  [/\bafin de\b/gi, 'pour'], [/\bafin que\b/gi, 'pour que'], [/\bà seule fin de\b/gi, 'pour'],
  [/\btoutefois\b/gi, 'mais'], [/\bnéanmoins\b/gi, 'mais'], [/\bcependant\b/gi, 'mais'],
  [/\ben outre\b/gi, 'aussi'], [/\bpar ailleurs\b/gi, 'aussi'], [/\bde surcroît\b/gi, 'aussi'],
  [/\bnotamment\b/gi, 'par exemple'], [/\bà savoir\b/gi, 'c’est-à-dire'],
  [/\bau sein de\b/gi, 'dans'], [/\bdans le cadre de\b/gi, 'pour'], [/\bau titre de\b/gi, 'pour'],
  [/\bà l[’']exception de\b/gi, 'sauf'], [/\ben vue de\b/gi, 'pour'], [/\bà l[’']issue de\b/gi, 'à la fin de'],
  [/\bs[’']acquitter d[’'](une?)\b/gi, 'payer $1'], [/\bs[’']acquitter de\b/gi, 'payer'], [/\bs[’']acquitter\b/gi, 'payer'], [/\bs[’']acquitte de\b/gi, 'paye'], [/\bacquitter\b/gi, 'payer'],
  [/\beffectu(er|ez)\b/gi, (m, e) => (e === 'er' ? 'faire' : 'faites')],
  [/\bprocéder à\b/gi, 'faire'], [/\bprocédez à\b/gi, 'faites'],
  [/\bbénéficier de\b/gi, 'avoir'], [/\bdisposer de\b/gi, 'avoir'], [/\bsolliciter\b/gi, 'demander'],
  [/\bci-joint(e|s)?\b/gi, 'avec ce document'], [/\bdès lors que\b/gi, 'si'], [/\blorsque\b/gi, 'quand'],
  [/\bpuisque\b/gi, 'comme'], [/\bultérieurement\b/gi, 'plus tard'], [/\bpréalablement\b/gi, 'avant'],
  [/\bau préalable\b/gi, 'avant'], [/\bdurant\b/gi, 'pendant'], [/\bafférent(e|s|es)?\b/gi, 'lié$1'],
  [/\bsusmentionné(e|s|es)?\b/gi, 'cité plus haut'], [/\bpostérieurement\b/gi, 'après'], [/\bantérieurement\b/gi, 'avant'],
  [/\bpercevoir\b/gi, 'recevoir'], [/\bdemeurer\b/gi, 'rester'], [/\bmunis? de\b/gi, 'avec'],
];

function keepCase(orig, repl) {
  return /^[A-ZÀ-Þ]/.test(orig) && /^[a-zà-ÿ]/.test(repl) ? repl[0].toUpperCase() + repl.slice(1) : repl;
}

export function applyLexicon(text) {
  let out = text;
  for (const [re, rep] of LEXICON) {
    out = out.replace(re, (m, ...rest) => keepCase(m, typeof rep === 'function' ? rep(m, ...rest) : rep.replace('$1', typeof rest[0] === 'string' ? rest[0] : '')));
  }
  return out;
}

const wc = (s) => (s.match(/\S+/g) || []).length;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const endDot = (s) => (/[.!?…:]$/.test(s.trim()) ? s.trim() : s.trim() + '.');

/** Coupe une phrase longue sur ; puis sur une virgule suivie d'une conjonction, si les deux moitiés sont substantielles. */
export function splitLong(sentence, max = 18) {
  if (wc(sentence) <= max) return [sentence];
  const SPLITS = [
    [/;\s+/, (r) => cap(r)],
    [/,\s+mais\s+/i, (r) => 'Mais ' + r], [/,\s+donc\s+/i, (r) => 'Donc ' + r], [/,\s+ainsi\s+/i, (r) => 'Ainsi ' + r],
    [/,\s+car\s+/i, (r) => 'C’est parce que ' + r], [/,\s+alors que\s+/i, (r) => 'Par contre, ' + r],
    [/,\s+tandis que\s+/i, (r) => 'Par contre, ' + r], [/,\s+puis\s+/i, (r) => 'Ensuite, ' + r],
    [/\s+et\s+(?=(?:il|elle|ils|elles|on|nous|vous|le|la|les|l[’'])\b)/i, (r) => cap(r)],
  ];
  for (const [re, mk] of SPLITS) {
    const m = re.exec(sentence);
    if (!m) continue;
    const left = sentence.slice(0, m.index), right = sentence.slice(m.index + m[0].length);
    if (wc(left) >= 5 && wc(right) >= 5) return [endDot(left), ...splitLong(mk(right), max)];
  }
  return [sentence];
}

/** Simplification déterministe d'un paragraphe. */
export function simplifyText(text) {
  const lex = applyLexicon(String(text));
  return splitSentences(lex).flatMap((s) => splitLong(s)).join(' ');
}

// ── Garde-fous ───────────────────────────────────────────────────────────────
/** Éléments qu'une reformulation ne doit JAMAIS perdre. */
export function protectedTokens(text) {
  const t = String(text), set = new Set();
  const add = (m) => set.add(norm(m).replace(/\s/g, '').toLowerCase());
  (t.match(/https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).forEach(add);
  (t.match(/\d[\d \t.,:/h€%-]*\d|\d/g) || []).forEach(add);
  (t.match(/[€$£%]/g) || []).forEach(add);
  // noms propres : mots capitalisés qui ne sont pas en début de phrase
  // chaque ligne (paragraphe, item de liste, cellule) commence une phrase : sa 1re majuscule n'est pas un nom propre
  const sents = t.split(/\n+/).flatMap((line) => splitSentences(line));
  for (const s of sents) {
    const words = s.split(/\s+/).slice(1);
    for (const w of words) { const c = w.replace(/^[«"“(]+|[»"”),.;:!?]+$/g, ''); if (/^[A-ZÀ-Þ][a-zà-ÿ]{2,}/.test(c)) add(c); }
  }
  return [...set];
}

export function checkPreserved(original, adapted) {
  const normalized = norm(adapted).toLowerCase();
  const hay = normalized.replace(/\s/g, '');
  const words = new Set(normalized.match(/[\p{L}\p{N}]+/gu) || []);
  const missing = protectedTokens(original).filter((tok) => {
    if (/^[\p{L}]+$/u.test(tok)) return !words.has(tok);
    if (/^\d/.test(tok)) {
      // « 50 » dans « 150 » ou « 50,5 » n'est pas le même montant.
      const escaped = [...tok].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      return !new RegExp('(?<!\\d)(?<!\\d[.,])' + escaped + '(?!\\d|[.,]\\d)', 'u').test(normalized);
    }
    return !hay.includes(tok);
  });
  return { ok: missing.length === 0, missing };
}

/** Filtre conservateur, PAS une preuve d'équivalence sémantique.
 * Les marqueurs de négation, condition, obligation et ordre doivent rester dans le même ordre.
 * On compare aussi chaque phrase : déplacer une négation entre deux consignes est refusé.
 */
export function checkMeaning(original, adapted) {
  const markers = (s) => (norm(s, { lower: true }).replace(/[’‘]/g, "'")
    .match(/\b(?:ne|n'|pas|plus|jamais|aucun|aucune|sans|sauf|uniquement|seulement|si|sinon|avant|après|doit|doivent|devez|devrait|peut|peuvent|pouvez|interdit|obligatoire|facultatif|minimum|maximum|moins|au moins|au plus)\b/g) || []).join('|');
  const a = splitSentences(original), b = splitSentences(adapted);
  if (markers(original) !== markers(adapted)) return { ok: false, reason: 'negation-condition-modalite' };
  if (a.length !== b.length && markers(original)) return { ok: false, reason: 'structure-consigne' };
  if (a.length === b.length && a.some((s, i) => markers(s) !== markers(b[i]))) return { ok: false, reason: 'consigne-deplacee' };
  // Même inventaire global ne suffit pas : on garde l'association des valeurs à leur phrase.
  if (a.length === b.length && a.some((s, i) => !checkPreserved(s, b[i]).ok)) return { ok: false, reason: 'valeur-deplacee' };
  return { ok: true };
}

/**
 * Détecte ce qu'une reformulation AJOUTE : chiffres, adresses ou noms propres absents de l'original, et trop de mots
 * nouveaux (un modèle qui invente des phrases). Le vocabulaire des règles de simplification est autorisé.
 * Heuristique : l'objectif est d'attraper les inventions, pas de refuser tout synonyme.
 * @returns {{ok:boolean, added:string[], novelRatio:number}}
 */
export function checkAdditions(original, adapted, opts = {}) {
  const maxRatio = opts.maxNovelRatio ?? 0.35;
  const orig = String(original), out = String(adapted);
  const hay = norm(orig).replace(/\s/g, '').toLowerCase();
  // 1) éléments sensibles apparus de nulle part
  const added = protectedTokens(out).filter((t) => !hay.includes(t));
  // 2) mots de contenu nouveaux (racine = 5 premières lettres, sans accents)
  const stem = (w) => norm(w).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 5);
  const words = (t) => (String(t).match(/[A-Za-zÀ-ÿ]{4,}/g) || []).map(stem);
  const known = new Set([...words(orig), ...words(simplifyText(orig))]);
  const content = words(out);
  const novel = content.filter((w) => !known.has(w));
  const novelRatio = content.length ? novel.length / content.length : 0;
  const ok = added.length === 0 && !(novel.length >= 3 && novelRatio > maxRatio);
  return { ok, added, novelRatio: Math.round(novelRatio * 100) / 100 };
}

/**
 * Adapte un texte : règles d'abord, puis (optionnellement) un adaptateur IA, vérifié.
 * @param {string} text
 * @param {{adapter?: (t:string)=>Promise<string>|string, maxGrowth?: number}} [opts]
 * @returns {Promise<{text:string, source:'rules'|'ai'|'original', reason?:string}>}
 */
export async function adaptText(text, opts = {}) {
  const original = String(text);
  if (!original.trim()) return { text: original, source: 'original' };
  // Si découper une consigne brouille sa structure, garder la phrase et ne changer que le vocabulaire.
  let ruled = simplifyText(original);
  if (!checkMeaning(original, ruled).ok) ruled = applyLexicon(original);
  const ruledCheck = checkPreserved(original, ruled);
  const rulesOk = ruledCheck.ok && checkMeaning(original, ruled).ok;
  const base = rulesOk ? ruled : original;
  if (typeof opts.adapter !== 'function') return { text: base, source: rulesOk ? 'rules' : 'original', reason: rulesOk ? undefined : 'regles-refusees' };
  try {
    const out = String(await opts.adapter(base));
    if (!out.trim()) return { text: base, source: 'rules', reason: 'ia-vide' };
    if (out.length > base.length * (opts.maxGrowth || 1.6) + 40) return { text: base, source: 'rules', reason: 'ia-trop-longue' };
    if (/[<>]/.test(out) && !/[<>]/.test(original)) return { text: base, source: 'rules', reason: 'ia-balises' };
    const c = checkPreserved(original, out);
    if (!c.ok) return { text: base, source: 'rules', reason: 'ia-perte: ' + c.missing.slice(0, 3).join(', ') };
    const a = checkAdditions(original, out);
    if (!a.ok) return { text: base, source: 'rules', reason: 'ia-ajout: ' + (a.added.length ? a.added.slice(0, 3).join(', ') : Math.round(a.novelRatio * 100) + ' % de mots nouveaux') };
    const meaning = checkMeaning(original, out);
    if (!meaning.ok) return { text: base, source: rulesOk ? 'rules' : 'original', reason: 'ia-sens: ' + meaning.reason };
    return { text: out.trim(), source: 'ai' };
  } catch (e) {
    return { text: base, source: 'rules', reason: 'ia-erreur' };
  }
}

// ── Document ─────────────────────────────────────────────────────────────────
/** Applique l'adaptation aux blocs de prose ; titres, tableaux, faits et actions restent intacts. */
export async function adaptDoc(doc, opts = {}) {
  const stats = { rules: 0, ai: 0, original: 0, rejected: [] };
  const run = async (inl) => {
    const plain = inlineText(inl);
    // texte avec liens/gras : on n'y touche pas (on ne casserait que la structure)
    if (Array.isArray(inl) && inl.some((r) => typeof r !== 'string')) { stats.original++; return inl; }
    const r = await adaptText(plain, opts); stats[r.source]++; if (r.reason && r.reason.startsWith('ia-')) stats.rejected.push(r.reason);
    return r.text;
  };
  const walk = async (b) => {
    switch (b.type) {
      case 'text': return { ...b, text: await run(b.text) };
      case 'quote': return { ...b, text: await run(b.text) };
      case 'callout': return { ...b, text: await run(b.text) };
      case 'list': return { ...b, items: await Promise.all(b.items.map(run)) };
      case 'steps': return { ...b, items: await Promise.all(b.items.map(async (i) => ({ ...i, text: await run(i.text || '') }))) };
      case 'section': return { ...b, blocks: await Promise.all(b.blocks.map(walk)) };
      default: return b;
    }
  };
  const blocks = await Promise.all(doc.blocks.map(walk));
  return { doc: { ...doc, blocks }, stats };
}
