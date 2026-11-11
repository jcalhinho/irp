/**
 * Repérage rapide de défauts d'accessibilité de la page SOURCE (heuristiques, sans moteur de rendu).
 * Ce n'est PAS un audit RGAA/WCAG : il liste des problèmes fréquents et objectifs, pour montrer ce que
 * le mode lecture contourne. Les contrastes de couleurs ne sont pas évalués.
 */
import { norm } from './doc.js';

const visibleName = (a) => norm(a.textContent || '') || norm(a.getAttribute('aria-label') || '') || norm(a.getAttribute('title') || '')
  || [...a.querySelectorAll('img[alt]')].map((i) => norm(i.getAttribute('alt'))).join('');

export function auditSource(document) {
  const body = document.body || document.documentElement;
  const imgs = [...body.querySelectorAll('img')].filter((i) => i.getAttribute('role') !== 'presentation' && i.getAttribute('aria-hidden') !== 'true');
  const imagesNoAlt = imgs.filter((i) => !i.hasAttribute('alt')).length;
  const emptyLinks = [...body.querySelectorAll('a[href]')].filter((a) => !visibleName(a)).length;
  const genericLinks = [...body.querySelectorAll('a[href]')].filter((a) => /^(cliquez ici|ici|en savoir plus|lire la suite|plus|click here|read more|more)$/i.test(norm(a.textContent || ''))).length;
  const heads = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
  let headingSkips = 0;
  heads.forEach((lv, i) => { if (i === 0 ? lv > 1 : lv > heads[i - 1] + 1) headingSkips++; });
  const h1Count = heads.filter((l) => l === 1).length;
  const tablesNoHeaders = [...body.querySelectorAll('table')].filter((t) => !t.querySelector('th') && t.querySelectorAll('tr').length > 1 && !t.querySelector('table')).length;
  const layoutTables = [...body.querySelectorAll('table')].filter((t) => t.querySelector('table') || (!t.querySelector('th') && t.querySelectorAll('h1,h2,h3,p,ul,ol').length > 0)).length;
  const hasLang = !!(document.documentElement && document.documentElement.getAttribute('lang'));
  const hasTitle = !!norm(document.title || '');
  const inputsNoLabel = [...body.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')]
    .filter((i) => !(i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title') || (i.id && document.querySelector(`label[for="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(i.id) : i.id}"]`)) || i.closest('label'))).length;

  const issues = [
    ['image-alt', "Images sans texte alternatif", imagesNoAlt],
    ['link-name', "Liens sans intitulé", emptyLinks],
    ['link-generic', "Liens du type « cliquez ici »", genericLinks],
    ['heading-order', "Sauts de niveau de titres", headingSkips],
    ['h1', h1Count === 1 ? '' : h1Count === 0 ? "Aucun titre de niveau 1" : "Plusieurs titres de niveau 1", h1Count === 1 ? 0 : 1],
    ['table-headers', "Tableaux de données sans en-têtes", tablesNoHeaders],
    ['layout-table', "Tableaux utilisés pour la mise en page", layoutTables],
    ['lang', "Langue de la page non déclarée", hasLang ? 0 : 1],
    ['title', "Page sans titre", hasTitle ? 0 : 1],
    ['label', "Champs de formulaire sans étiquette", inputsNoLabel],
  ].filter((x) => x[2] > 0).map(([id, label, count]) => ({ id, label, count }));
  return { issues, total: issues.reduce((a, i) => a + i.count, 0), images: imgs.length };
}
