/**
 * Vérification du contrat `must_show` : ce que l'émetteur déclare INDISPENSABLE doit être
 * présent, tel quel, dans le texte réellement rendu. C'est la garantie que l'adaptation
 * (règles ou IA) n'a rien supprimé d'important — et ce qu'on peut prouver à un auditeur.
 */
import { norm } from './doc.js';

const fold = (s) => norm(s, { lower: true }).replace(/[’‘]/g, "'");

/**
 * @param {string[]} mustShow chaînes littérales attendues (prix, dates, numéros, noms…)
 * @param {string} renderedText texte visible rendu
 * @returns {{ok:boolean, total:number, found:number, missing:string[], rate:number}}
 */
export function verifyMustShow(mustShow, renderedText) {
  const hay = fold(renderedText), hayNoSp = hay.replace(/\s/g, '');
  const missing = [];
  for (const m of mustShow || []) {
    const n = fold(m);
    if (!hay.includes(n) && !hayNoSp.includes(n.replace(/\s/g, ''))) missing.push(m);
  }
  const total = (mustShow || []).length;
  return { ok: missing.length === 0, total, found: total - missing.length, missing, rate: total ? (total - missing.length) / total : 1 };
}

import { docText } from './doc.js';
import { checkPreserved } from './simplify.js';

/**
 * Garantie sans vérité terrain (pages réelles) : tout nombre, date, montant, e-mail, URL et nom propre
 * du document d'origine doit se retrouver dans le texte réellement affiché.
 * @returns {{ok:boolean, missing:string[]}}
 */
export function verifyPreserved(originalDoc, renderedText) {
  return checkPreserved(docText(originalDoc), renderedText);
}
