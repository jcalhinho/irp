import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  validateDoc, renderDoc, visibleText, THEMES, PROFILES, resolveProfile, buildCss, safeHref, safeImgSrc,
  simplifyText, readability, protectedTokens, adaptText, adaptDoc, checkPreserved, extractDoc, auditSource, verifyMustShow, toMarkdown, approxTokens, syllables,
} from '../irp-core/index.js';

const mk = (html = '<!doctype html><html lang="fr"><body></body></html>', url = 'https://exemple.fr/') => new JSDOM(html, { url }).window.document;
const base = (blocks, extra = {}) => ({ irp_doc: '1.0', lang: 'fr', title: 'Titre', blocks, ...extra });

// ── Validation ───────────────────────────────────────────────────────────────
test('validateDoc : document valide accepté', () => {
  const d = base([{ type: 'heading', level: 2, text: 'A' }, { type: 'text', text: ['a ', { t: 'a', href: '/x', text: 'lien' }] },
    { type: 'table', headers: ['a'], rows: [['1']] }, { type: 'facts', items: [{ label: 'Prix', value: '5 €' }] }]);
  assert.deepEqual(validateDoc(d), { ok: true, errors: [] });
});

test('validateDoc : refuse type inconnu, URL dangereuse, mauvais types, profondeur', () => {
  assert.equal(validateDoc(base([{ type: 'html', text: '<b>' }])).ok, false);
  assert.equal(validateDoc(base([{ type: 'text', text: [{ t: 'a', href: 'javascript:alert(1)', text: 'x' }] }])).ok, false);
  assert.equal(validateDoc(base([{ type: 'actions', items: [{ label: 'x', href: 'data:text/html,<script>' }] }])).ok, false);
  assert.equal(validateDoc(base([{ type: 'text', text: 42 }])).ok, false);
  assert.equal(validateDoc({ irp_doc: '2.0', title: 'x', blocks: [] }).ok, false);
  assert.equal(validateDoc(null).ok, false);
  let deep = { type: 'text', text: 'x' };
  for (let i = 0; i < 9; i++) deep = { type: 'section', blocks: [deep] };
  assert.equal(validateDoc(base([deep])).ok, false);
});

test('safeHref / safeImgSrc : schémas dangereux et contournements', () => {
  for (const h of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\tscript:alert(1)', 'java\nscript:x', '\u0001javascript:x', 'data:text/html,x', 'vbscript:x', '//evil.example/x', 'file:///etc/passwd'])
    assert.equal(safeHref(h), null, h);
  for (const h of ['https://a.fr/x', 'http://a.fr', '/chemin', '#ancre', 'page.html', 'mailto:a@b.fr', 'tel:+33123456789'])
    assert.notEqual(safeHref(h), null, h);
  assert.equal(safeImgSrc('http://tracker.example/p.gif'), null);
  assert.equal(safeImgSrc('data:image/svg+xml,<svg onload=alert(1)>'), null);
  assert.notEqual(safeImgSrc('https://a.fr/i.png'), null);
});

// ── Rendu : sécurité ─────────────────────────────────────────────────────────
const PAYLOADS = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><svg onload=alert(1)>', '</style><script>alert(1)</script>', '<iframe src=javascript:alert(1)>', '{{constructor.constructor("alert(1)")()}}'];

test('rendu : charges XSS dans tous les champs → texte inerte, aucun élément dangereux', () => {
  for (const p of PAYLOADS) {
    const doc = base([
      { type: 'heading', level: 2, text: p }, { type: 'text', text: p }, { type: 'list', items: [p, [p]] },
      { type: 'quote', text: p, cite: p }, { type: 'callout', kind: 'warning', title: p, text: p }, { type: 'code', text: p },
      { type: 'facts', items: [{ label: p, value: p }] }, { type: 'table', caption: p, headers: [p], rows: [[p]] },
      { type: 'image', alt: p, src: 'https://a.fr/x.png' }, { type: 'steps', items: [{ title: p, text: p }] },
      { type: 'section', title: p, blocks: [{ type: 'text', text: p }] },
    ], { title: p, description: p });
    const c = mk().createElement('div');
    const r = renderDoc(doc, c, { allowImages: true });
    assert.equal(r.ok, true);
    assert.equal(c.querySelectorAll('script,iframe,object,embed,svg,form,input').length, 0, p);
    for (const el of c.querySelectorAll('*')) for (const a of el.attributes) assert.ok(!/^on/i.test(a.name), `${el.tagName}[${a.name}]`);
    // les seules <img> possibles : celle d'image https déclarée
    assert.ok(c.querySelectorAll('img').length <= 1);
    assert.ok(c.textContent.includes(p) || p.includes('{{'), 'le texte doit apparaître tel quel (échappé)');
  }
});

test('rendu : URL dangereuse dans un document non validé → refus propre, rien n\'est rendu', () => {
  const c = mk().createElement('div');
  const r = renderDoc(base([{ type: 'text', text: [{ t: 'a', href: 'javascript:alert(1)', text: 'clic' }] }]), c);
  assert.equal(r.ok, false);
  assert.equal(c.querySelectorAll('a').length, 0);
  assert.match(c.textContent, /invalide/);
});

test('rendu : images distantes bloquées par défaut (pas de pistage), alt conservé', () => {
  const c = mk().createElement('div');
  const r = renderDoc(base([{ type: 'image', alt: 'Une mairie', src: 'https://tracker.example/p.png' }]), c);
  assert.equal(c.querySelectorAll('img').length, 0);
  assert.equal(r.report.imagesBlocked, 1);
  assert.match(c.textContent, /Une mairie/);
  const c2 = mk().createElement('div');
  renderDoc(base([{ type: 'image', alt: 'Une mairie', src: 'https://a.fr/p.png' }]), c2, { allowImages: true });
  const img = c2.querySelector('img');
  assert.equal(img.getAttribute('referrerpolicy'), 'no-referrer');
});

test('rendu : le CSS ne contient jamais de texte du document ; profil malveillant borné', () => {
  const css = buildCss({ theme: 'x;}body{display:none', font: '"};alert(1)', size: 1e9, spacing: '<script>', width: -5 });
  assert.ok(!/display:none|alert|<script/.test(css));
  const p = resolveProfile({ size: 1e9, width: -5, theme: 'zzz' });
  assert.deepEqual([p.theme, p.size, p.width], ['standard', 2.5, 30]);
  const c = mk().createElement('div');
  renderDoc(base([{ type: 'text', text: '</style><script>alert(1)</script>' }]), c);
  assert.ok(!c.querySelector('style').textContent.includes('alert'));
});

// ── Rendu : accessibilité par construction ───────────────────────────────────
test('rendu : un seul h1, niveaux sans saut, landmarks, lien d\'évitement, tableau avec caption/scope', () => {
  const c = mk().createElement('div');
  const doc = base([{ type: 'heading', level: 5, text: 'Saut' }, { type: 'heading', level: 2, text: 'Ok' }, { type: 'heading', level: 6, text: 'Saut2' },
    { type: 'table', caption: 'Tarifs', headers: ['Nom', 'Prix'], rows: [['A', '1']] }]);
  const r = renderDoc(doc, c);
  assert.equal(c.querySelectorAll('h1').length, 1);
  const levels = [...c.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, levels.join(','));
  assert.ok(r.report.headingsFixed >= 1);
  assert.ok(c.querySelector('main'));
  assert.equal(c.querySelector('.irp-skip').getAttribute('href'), '#irp-main');
  assert.equal(c.querySelector('caption').textContent, 'Tarifs');
  assert.equal(c.querySelector('th').getAttribute('scope'), 'col');
  assert.equal(c.querySelector('.irp-root').getAttribute('lang'), 'fr');
});

// contraste WCAG 2.x
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('thèmes : tous les couples texte/fond respectent WCAG AA (≥ 4.5:1), contraste élevé ≥ 7:1', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const [fg, bg] of [['fg', 'bg'], ['muted', 'bg'], ['link', 'bg'], ['btnFg', 'btnBg'], ['fg', 'calloutBg'], ['link', 'calloutBg']])
      assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name} ${fg}/${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
    // bordures : composant d'interface ≥ 3:1
    assert.ok(ratio(t.border, t.bg) >= 3, `${name} border`);
  }
  assert.ok(ratio(THEMES.contrast.fg, THEMES.contrast.bg) >= 7);
});

test('profils : dyslexie = espacements WCAG 1.4.12, FALC activé, colonne étroite', () => {
  const css = buildCss('dyslexie');
  assert.match(css, /letter-spacing:0\.12em/); assert.match(css, /word-spacing:0\.16em/); assert.match(css, /line-height:1\.8/);
  assert.equal(PROFILES.falc.falc, true);
  assert.ok(resolveProfile('dyslexie').width <= 62);
});

// ── Simplification & garde-fous ──────────────────────────────────────────────
const ADMIN = "Afin de bénéficier de l’allocation, le demandeur doit s’acquitter de la somme de 45 € auprès du service concerné, mais il convient de procéder à l’envoi des pièces justificatives avant le 15 mars 2027, car le dossier sera sinon classé sans suite.";

test('simplifyText : vocabulaire courant, phrases courtes, rien de perdu', () => {
  const out = simplifyText(ADMIN);
  assert.match(out, /Pour avoir/); assert.match(out, /payer/); assert.doesNotMatch(out, /Afin de|s’acquitter/);
  assert.ok(out.split(/(?<=[.!?])\s/).length >= 3, out);
  assert.equal(checkPreserved(ADMIN, out).ok, true);
  assert.ok(out.includes('45 €') && out.includes('15 mars 2027'));
});

test('readability : le texte simplifié est mesurablement plus lisible', () => {
  const a = readability(ADMIN), b = readability(simplifyText(ADMIN));
  assert.ok(b.score > a.score, `${a.score} → ${b.score}`);
  assert.ok(b.avgWords < a.avgWords);
  assert.equal(syllables('bonjour'), 2);
});

test('adaptText : une reformulation IA qui perd un montant ou une date est refusée', async () => {
  const bad = await adaptText(ADMIN, { adapter: () => 'Il faut payer et envoyer les papiers vite.' });
  assert.equal(bad.source, 'rules'); assert.match(bad.reason, /ia-perte/);
  assert.ok(bad.text.includes('45 €') && bad.text.includes('15 mars 2027'));
  const good = await adaptText('Payez 45 € avant le 15 mars 2027 à la mairie de Lyon.', { adapter: (t) => 'Vous payez 45 € avant le 15 mars 2027 à la mairie de Lyon.' });
  assert.equal(good.source, 'ai');
});

test('adaptText : une IA qui injecte des balises, vide, trop longue ou qui plante → repli sur les règles', async () => {
  const t = 'Payez 45 € avant le 15 mars 2027.';
  assert.match((await adaptText(t, { adapter: () => 'Payez 45 € avant le 15 mars 2027 <script>x</script>' })).reason, /balises/);
  assert.match((await adaptText(t, { adapter: () => '  ' })).reason, /vide/);
  assert.match((await adaptText(t, { adapter: () => t + ' ' + 'x'.repeat(500) })).reason, /longue/);
  assert.match((await adaptText(t, { adapter: () => { throw new Error('réseau'); } })).reason, /erreur/);
});

test('adaptDoc : ne touche ni titres, ni tableaux, ni faits, ni actions ; conserve must_show', async () => {
  const doc = base([{ type: 'heading', level: 2, text: 'Afin de' }, { type: 'text', text: ADMIN }, { type: 'facts', items: [{ label: 'Afin de', value: 'durant' }] },
    { type: 'table', headers: ['Afin de'], rows: [['durant']] }], { must_show: ['45 €', '15 mars 2027'] });
  const { doc: out, stats } = await adaptDoc(doc, {});
  assert.equal(out.blocks[0].text, 'Afin de'); assert.deepEqual(out.blocks[2], doc.blocks[2]); assert.deepEqual(out.blocks[3], doc.blocks[3]);
  assert.notEqual(out.blocks[1].text, ADMIN); assert.equal(stats.rules, 1);
  const c = mk().createElement('div'); const r = renderDoc(out, c);
  assert.equal(verifyMustShow(out.must_show, r.text).ok, true);
});

// ── Extraction ───────────────────────────────────────────────────────────────
const PAGE = `<!doctype html><html lang="fr"><head><title>Mairie de Test — Carte d'identité</title></head><body>
<header><nav><a href="/">Accueil</a><a href="/contact">Contact</a></nav></header>
<div class="cookie-banner">Nous utilisons des cookies <button>Accepter</button></div>
<main><h1>Carte d'identité</h1>
<p>Le délai est de <strong>3 semaines</strong>. Voir <a href="/demarches/rdv">la prise de rendez-vous</a> ou <a href="javascript:alert(1)">ce lien piégé</a>.</p>
<p>Le timbre fiscal coûte 25 € et la photo 12 €. Prévoyez un justificatif de domicile de moins de 6 mois pour le dépôt.</p>
<ul><li>Ancienne carte</li><li>Photo récente</li></ul>
<table><caption>Horaires</caption><tr><th>Jour</th><th>Heures</th></tr><tr><td>Lundi</td><td>9h-12h</td></tr></table>
<img src="/p.jpg"><img src="/deco.png" alt=""><img src="/ok.png" alt="Guichet">
<script>steal()</script></main>
<aside>Publicité</aside><footer>© Mairie</footer></body></html>`;

test('extractDoc : garde le contenu, retire nav/cookies/footer/script, résout et filtre les liens', () => {
  const { doc, report } = extractDoc(mk(PAGE), { url: 'https://mairie.test/carte' });
  assert.equal(validateDoc(doc).ok, true, JSON.stringify(validateDoc(doc).errors));
  assert.equal(doc.title, "Carte d'identité");
  const txt = JSON.stringify(doc);
  for (const must of ['3 semaines', '25 €', '12 €', 'justificatif de domicile', '9h-12h', 'Photo récente']) assert.ok(txt.includes(must), must);
  for (const gone of ['Accueil', 'cookies', 'Publicité', '© Mairie', 'steal', 'javascript']) assert.ok(!txt.includes(gone), gone);
  assert.ok(txt.includes('https://mairie.test/demarches/rdv'));
  assert.equal(report.imagesNoAlt, 1);
  assert.ok(!doc.blocks.some((b) => b.type === 'image' && b.src && b.src.includes('deco')));
});

test('extractDoc : ne modifie pas la page source', () => {
  const d = mk(PAGE); const before = d.documentElement.outerHTML;
  extractDoc(d, { url: 'https://mairie.test/' });
  assert.equal(d.documentElement.outerHTML, before);
});

test('extractDoc : page piégée (payloads partout) → doc valide, rendu inerte', () => {
  const evil = `<html><head><title><img src=x onerror=alert(1)></title></head><body><main><h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>
  <p onclick="alert(1)">${'Texte assez long pour compter comme contenu. '.repeat(5)}<a href="  JaVa\tScRiPt:alert(1)">x</a><a href="//evil.example/x">y</a></p>
  <img src="data:image/svg+xml,<svg onload=alert(1)>" alt="a"><table><tr><td><table><tr><td>imbriqué</td></tr></table></td></tr></table>
  </main></body></html>`;
  const { doc } = extractDoc(mk(evil), { url: 'https://a.test/' });
  assert.equal(validateDoc(doc).ok, true);
  const c = mk().createElement('div'); renderDoc(doc, c, { allowImages: true });
  assert.equal(c.querySelectorAll('script,iframe,svg').length, 0);
  // le lien protocole-relatif est résolu en https absolu (comportement navigateur) : un simple lien sortant, jamais un schéma exécutable
  for (const a of c.querySelectorAll('a')) assert.match(a.getAttribute('href'), /^(https?:|\/|#|mailto:|tel:)/i);
  assert.ok(![...c.querySelectorAll('a')].some((a) => /javascript/i.test(a.getAttribute('href'))));
  for (const el of c.querySelectorAll('*')) for (const a of el.attributes) assert.ok(!/^on/i.test(a.name));
});

// ── Vérification & vue agent ─────────────────────────────────────────────────
test('verifyMustShow : insensible aux espaces insécables/casse ; signale ce qui manque', () => {
  const r = verifyMustShow(['2 799 €', 'Mairie de Lyon', 'absent'], 'Prix : 2 799 € — mairie de lyon');
  assert.deepEqual([r.ok, r.found, r.missing], [false, 2, ['absent']]);
  assert.equal(verifyMustShow([], 'x').rate, 1);
});

test('toMarkdown : compact, liens/gras/tableaux, et bien plus court que le HTML source', () => {
  const { doc } = extractDoc(mk(PAGE), { url: 'https://mairie.test/carte' });
  const md = toMarkdown(doc);
  assert.match(md, /^# Carte d'identité/); assert.match(md, /\*\*3 semaines\*\*/); assert.match(md, /\[la prise de rendez-vous\]\(https:\/\/mairie\.test\/demarches\/rdv\)/);
  assert.match(md, /\| Jour \| Heures \|/);
  assert.ok(approxTokens(md) < approxTokens(PAGE));
});

test('garde-fous : une majuscule de début de paragraphe ou de ligne n\'est pas un nom propre', () => {
  const orig = 'Afin de payer.\nPour toute question, appelez Marie Durand.';
  assert.deepEqual(protectedTokens(orig).filter((t) => ['afin', 'pour'].includes(t)), []);
  assert.ok(protectedTokens(orig).includes('durand'));
  assert.equal(checkPreserved(orig, 'Pour payer. Appelez Marie Durand.').ok, true);
  assert.equal(checkPreserved(orig, 'Pour payer. Appelez Marie.').ok, false);
});

test('lexique : aucune tournure bancale (« s\'payer ») après remplacement', () => {
  assert.equal(simplifyText("Il doit s'acquitter d'un timbre de 25 €."), 'Il doit payer un timbre de 25 €.');
  assert.equal(simplifyText("Il doit s’acquitter de la somme de 25 €."), 'Il doit payer la somme de 25 €.');
  assert.equal(simplifyText('Il doit s’acquitter rapidement.'), 'Il doit payer rapidement.');
  for (const out of [simplifyText(ADMIN)]) assert.doesNotMatch(out, /\bs[’']payer\b|\bs[’']pay/);
});

test('auditSource : repère les défauts courants de la page source, et seulement eux', () => {
  const bad = mk('<html><body><h3>Titre</h3><img src="a.png"><img src="b.png" alt=""><a href="/x"><img src="i.png"></a><a href="/y">cliquez ici</a>'
    + '<table><tr><td>a</td></tr><tr><td>b</td></tr></table><input type="text"></body></html>');
  const r = auditSource(bad); const by = Object.fromEntries(r.issues.map((i) => [i.id, i.count]));
  assert.equal(by['image-alt'], 2); assert.equal(by['link-name'], 1); assert.equal(by['link-generic'], 1);
  assert.equal(by['heading-order'], 1); assert.equal(by.h1, 1); assert.equal(by.lang, 1); assert.equal(by.title, 1);
  assert.equal(by['table-headers'], 1); assert.equal(by.label, 1);
  const good = mk('<!doctype html><html lang="fr"><head><title>ok</title></head><body><h1>T</h1><h2>S</h2><img src="a.png" alt="x"><a href="/x">Voir les tarifs</a>'
    + '<label for="n">Nom</label><input id="n"></body></html>');
  assert.deepEqual(auditSource(good).issues, []);
});
