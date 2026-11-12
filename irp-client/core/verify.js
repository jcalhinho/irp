/**
 * Vérification du contrat `must_show` : ce que l'émetteur déclare INDISPENSABLE doit être
 * présent dans le texte rendu, après normalisation. Ce contrôle de présence littérale
 * ne prouve ni le sens, ni l'association d'une valeur à son contexte.
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
 * Contrôle heuristique des nombres, montants, e-mails, URLs et noms repérés dans le
 * document extrait. L'exhaustivité de l'extraction et le sens ne sont pas vérifiés ici.
 * @returns {{ok:boolean, missing:string[]}}
 */
export function verifyPreserved(originalDoc, renderedText) {
  return checkPreserved(docText(originalDoc), renderedText);
}
