/**
 * Benchmark IRP : extraction → rendu déterministe → adaptation FALC, sur un corpus de pages.
 *   node run.mjs [--dir pages] [--manifest manifest.json] [--out .]
 * Mesure : respect de `must_show` (à chaque étape), latence, lisibilité, violations axe-core
 * (page d'origine vs page rendue), poids (HTML vs IRP-Doc vs Markdown), efficacité des garde-fous IA.
 * Limites assumées : axe-core sous jsdom ne calcule pas le contraste des couleurs (pas de moteur de rendu) ;
 * le contraste des thèmes IRP est vérifié par calcul dans tests/core.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { JSDOM } from '../tests/node_modules/jsdom/lib/api.js';
import {
  extractDoc, renderDoc, adaptDoc, adaptText, readability, docText, validateDoc, verifyMustShow, verifyPreserved, toMarkdown, approxTokens, PROFILES,
} from '../irp-core/index.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const dir = path.resolve(here, arg('dir', 'pages'));
const manifest = JSON.parse(fs.readFileSync(path.resolve(here, arg('manifest', 'manifest.json')), 'utf8'));
const outDir = path.resolve(here, arg('out', '.'));
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('../tests/node_modules/axe-core/axe.min.js'), 'utf8');

const now = () => Number(process.hrtime.bigint()) / 1e6;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;

async function axeRun(dom) {
  const w = dom.window; w.eval(axeSource);
  const res = await w.axe.run(w.document, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const rules = {};
  for (const v of res.violations) { byImpact[v.impact || 'minor'] += v.nodes.length; rules[v.id] = (rules[v.id] || 0) + v.nodes.length; }
  return { violations: res.violations.reduce((a, v) => a + v.nodes.length, 0), byImpact, rules };
}

/** Adaptateur IA « hostile » déterministe : une fois sur deux il supprime/altère un fait. Sert à mesurer les garde-fous. */
function hostileAdapter(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280; // décision fixée à la création : même verdict à chaque appel
  const hostile = x - Math.floor(x) < 0.5;
  return (t) => (hostile ? t.replace(/\d+/g, 'plusieurs').replace(/\bde\b/, 'du') : t);
}

const rows = [];
const profiles = ['standard', 'dyslexie', 'falc', 'basse_vision'];
let seed = 7;

for (const m of manifest) {
  const html = fs.readFileSync(path.join(dir, m.id + '.html'), 'utf8');
  const row = { id: m.id, kind: m.kind, layout: m.layout, htmlBytes: Buffer.byteLength(html) };
  const baseDom = new JSDOM(html, { url: 'https://site.test/' + m.id, runScripts: 'outside-only' });
  const baseText = baseDom.window.document.body.textContent;
  row.baselineMust = verifyMustShow(m.must_show, baseText).rate;

  // 1. extraction
  let t0 = now();
  const { doc, report } = extractDoc(baseDom.window.document, { url: 'https://site.test/' + m.id, mustShow: m.must_show });
  row.extractMs = now() - t0;
  row.valid = validateDoc(doc).ok;
  row.extractRoot = report.root;
  row.blocks = doc.blocks.length;
  row.imagesNoAlt = report.imagesNoAlt;
  const rootDoc = new JSDOM('<!doctype html><html lang="fr"><head><title>t</title></head><body></body></html>').window.document;
  const host = rootDoc.body;

  // 2. rendu pour chaque profil + vérification du contrat
  row.render = {};
  for (const p of profiles) {
    t0 = now();
    const r = renderDoc(doc, host, { profile: p });
    const ms = now() - t0;
    row.render[p] = { ms, must: verifyMustShow(m.must_show, r.text).rate };
  }

  // 3. FALC (règles seules) : lisibilité avant/après + contrat
  const before = readability(docText(doc));
  t0 = now();
  const { doc: falcDoc } = await adaptDoc(doc, {});
  row.adaptMs = now() - t0;
  const after = readability(docText(falcDoc));
  row.readBefore = before.score; row.readAfter = after.score; row.avgWordsBefore = before.avgWords; row.avgWordsAfter = after.avgWords;
  row.longBefore = before.longSentences; row.longAfter = after.longSentences;
  const rf = renderDoc(falcDoc, host, { profile: 'falc' });
  row.falcMust = verifyMustShow(m.must_show, rf.text).rate;
  row.preservedOk = verifyPreserved(doc, rf.text).ok;

  // 4. IA hostile : combien de sorties auraient perdu un fait sans garde-fou, combien sont bloquées avec
  let unsafe = 0, blocked = 0, total = 0, leaked = 0;
  for (const b of doc.blocks.filter((x) => x.type === 'text' && typeof x.text === 'string')) {
    const ad = hostileAdapter(seed++);
    const raw = ad(b.text); total++;
    // vérité indépendante du garde-fou : un nombre de l'original a disparu de la sortie
    const rawLoses = (b.text.match(/\d+/g) || []).some((d) => !raw.includes(d));
    const guarded = await adaptText(b.text, { adapter: ad });
    if (rawLoses) { unsafe++; if (guarded.source !== 'ai') blocked++; else leaked++; }
  }
  row.hostile = { total, unsafe, blocked, leaked };

  // 5. axe : original vs rendu (profil falc)
  row.axeBefore = await axeRun(baseDom);
  const renderedDom = new JSDOM('<!doctype html><html lang="fr"><head><title>' + doc.title.replace(/</g, '') + '</title></head><body></body></html>', { runScripts: 'outside-only' });
  renderDoc(falcDoc, renderedDom.window.document.body, { profile: 'falc' });
  row.axeAfter = await axeRun(renderedDom);

  // 6. poids
  const json = JSON.stringify(doc), md = toMarkdown(doc);
  row.docBytes = Buffer.byteLength(json); row.mdBytes = Buffer.byteLength(md);
  row.tokHtml = approxTokens(html); row.tokMd = approxTokens(md);
  rows.push(row);
  process.stdout.write('.');
}
console.log();

const all = (f) => rows.map(f);
const S = {
  pages: rows.length,
  baselineMust: r2(mean(all((r) => r.baselineMust))),
  extractValid: rows.filter((r) => r.valid).length,
  mustAfterExtract: {}, 
  mustFalc: r2(mean(all((r) => r.falcMust))),
  pagesFullMust: Object.fromEntries(profiles.map((p) => [p, rows.filter((r) => r.render[p].must === 1).length])),
  preservedOk: rows.filter((r) => r.preservedOk).length,
  falcPagesFullMust: rows.filter((r) => r.falcMust === 1).length,
  latency: {
    extractP50: r1(pct(all((r) => r.extractMs), 0.5)), extractP95: r1(pct(all((r) => r.extractMs), 0.95)),
    renderP50: r1(pct(rows.flatMap((r) => profiles.map((p) => r.render[p].ms)), 0.5)), renderP95: r1(pct(rows.flatMap((r) => profiles.map((p) => r.render[p].ms)), 0.95)),
    adaptP50: r1(pct(all((r) => r.adaptMs), 0.5)), adaptP95: r1(pct(all((r) => r.adaptMs), 0.95)),
  },
  readability: { before: r1(mean(all((r) => r.readBefore))), after: r1(mean(all((r) => r.readAfter))),
    avgWordsBefore: r1(mean(all((r) => r.avgWordsBefore))), avgWordsAfter: r1(mean(all((r) => r.avgWordsAfter))),
    longBefore: rows.reduce((a, r) => a + r.longBefore, 0), longAfter: rows.reduce((a, r) => a + r.longAfter, 0) },
  axe: {
    before: rows.reduce((a, r) => a + r.axeBefore.violations, 0), after: rows.reduce((a, r) => a + r.axeAfter.violations, 0),
    pagesCleanBefore: rows.filter((r) => r.axeBefore.violations === 0).length, pagesCleanAfter: rows.filter((r) => r.axeAfter.violations === 0).length,
    seriousBefore: rows.reduce((a, r) => a + r.axeBefore.byImpact.critical + r.axeBefore.byImpact.serious, 0),
    seriousAfter: rows.reduce((a, r) => a + r.axeAfter.byImpact.critical + r.axeAfter.byImpact.serious, 0),
    rulesBefore: {}, rulesAfter: {},
  },
  hostile: rows.reduce((a, r) => ({ total: a.total + r.hostile.total, unsafe: a.unsafe + r.hostile.unsafe, blocked: a.blocked + r.hostile.blocked, leaked: a.leaked + r.hostile.leaked }), { total: 0, unsafe: 0, blocked: 0, leaked: 0 }),
  size: { html: rows.reduce((a, r) => a + r.htmlBytes, 0), doc: rows.reduce((a, r) => a + r.docBytes, 0), md: rows.reduce((a, r) => a + r.mdBytes, 0),
    tokHtml: rows.reduce((a, r) => a + r.tokHtml, 0), tokMd: rows.reduce((a, r) => a + r.tokMd, 0) },
};
S.mustAfterExtract = r2(mean(all((r) => r.render.standard.must)));
for (const r of rows) { for (const [k, v] of Object.entries(r.axeBefore.rules)) S.axe.rulesBefore[k] = (S.axe.rulesBefore[k] || 0) + v; for (const [k, v] of Object.entries(r.axeAfter.rules)) S.axe.rulesAfter[k] = (S.axe.rulesAfter[k] || 0) + v; }

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ summary: S, rows }, null, 2));

const pc = (x) => Math.round(x * 100) + ' %';
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` ×${v}`).join(', ') || '—';
const fails = rows.filter((r) => r.render.standard.must < 1 || r.falcMust < 1);
const md = `# Rapport de benchmark IRP

*Généré par \`bench/run.mjs\` — ${new Date().toISOString().slice(0, 10)} — ${S.pages} pages (corpus synthétique, voir limites).*

## Résultats

| Mesure | Résultat |
|---|---|
| Faits \`must_show\` présents dans la page d'origine (sanité du corpus) | ${pc(S.baselineMust)} |
| Documents extraits valides | ${S.extractValid} / ${S.pages} |
| \`must_show\` respecté après extraction + rendu (profil standard) | ${pc(S.mustAfterExtract)} — pages 100 % : ${S.pagesFullMust.standard} / ${S.pages} |
| idem profils dyslexie / FALC / basse vision | ${S.pagesFullMust.dyslexie} / ${S.pagesFullMust.falc} / ${S.pagesFullMust.basse_vision} pages 100 % |
| \`must_show\` respecté après simplification FALC | ${pc(S.mustFalc)} — pages 100 % : ${S.falcPagesFullMust} / ${S.pages} |
| Garde-fou « rien de perdu » (nombres, dates, noms) après FALC | ${S.preservedOk} / ${S.pages} pages |
| Latence extraction p50 / p95 | ${S.latency.extractP50} ms / ${S.latency.extractP95} ms |
| Latence rendu p50 / p95 | ${S.latency.renderP50} ms / ${S.latency.renderP95} ms |
| Latence adaptation (règles) p50 / p95 | ${S.latency.adaptP50} ms / ${S.latency.adaptP95} ms |
| Lisibilité (Kandel-Moles, plus haut = plus facile) | ${S.readability.before} → **${S.readability.after}** |
| Mots par phrase (moyenne) | ${S.readability.avgWordsBefore} → **${S.readability.avgWordsAfter}** |
| Phrases de plus de 20 mots | ${S.readability.longBefore} → **${S.readability.longAfter}** |
| Violations axe-core (total) | ${S.axe.before} → **${S.axe.after}** |
| dont critiques + sérieuses | ${S.axe.seriousBefore} → **${S.axe.seriousAfter}** |
| Pages sans aucune violation axe | ${S.axe.pagesCleanBefore} → **${S.axe.pagesCleanAfter}** / ${S.pages} |
| Poids : HTML → IRP-Doc (JSON) → Markdown | ${(S.size.html / 1024).toFixed(0)} Ko → ${(S.size.doc / 1024).toFixed(0)} Ko → ${(S.size.md / 1024).toFixed(0)} Ko |
| Tokens pour un agent : HTML → Markdown | ${S.size.tokHtml} → **${S.size.tokMd}** (÷${(S.size.tokHtml / S.size.tokMd).toFixed(1)}) |
| IA hostile : reformulations qui auraient perdu un fait | ${S.hostile.unsafe} / ${S.hostile.total} |
| … bloquées par les garde-fous / laissées passer | **${S.hostile.blocked}** / ${S.hostile.leaked} |

Règles axe-core avant : ${top(S.axe.rulesBefore)}
Règles axe-core après : ${top(S.axe.rulesAfter)}

${fails.length ? `## Échecs \`must_show\`\n\n${fails.map((r) => `- **${r.id}** : extraction ${pc(r.render.standard.must)}, FALC ${pc(r.falcMust)}`).join('\n')}\n` : '## Échecs `must_show`\n\nAucun.\n'}
## Limites (à lire avant de citer ces chiffres)

- **Corpus synthétique** : 20 pages françaises écrites pour reproduire des défauts courants (bruit, mises en page en tableaux, images sans alt, sauts de titres, phrases administratives longues). Ce n'est pas un échantillon du web réel : les scores d'extraction sur des pages réelles seront plus bas. Pour mesurer des pages réelles : enregistrer le HTML dans un dossier, ajouter un \`manifest.json\` avec les faits à conserver, lancer \`node run.mjs --dir <dossier> --manifest <fichier>\`.
- **axe-core sous jsdom** ne calcule pas les contrastes de couleurs (règle désactivée). Les thèmes IRP sont vérifiés par calcul (WCAG AA ≥ 4,5:1) dans \`tests/core.test.mjs\`, pas la page d'origine.
- La lisibilité est une **mesure automatique** (indice de Kandel-Moles, syllabes estimées), pas un FALC validé : un vrai FALC se valide avec des personnes en situation de handicap intellectuel.
- L'« IA hostile » est un adaptateur simulé qui altère des chiffres une fois sur deux ; il mesure l'efficacité des **garde-fous**, pas la qualité d'un vrai modèle.
`;
fs.writeFileSync(path.join(outDir, 'REPORT.md'), md);
console.log(md.split('\n').slice(0, 34).join('\n'));
