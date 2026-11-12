import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fromPlainText, compareReading, readingPrefs, adaptText, adaptDoc, checkMeaning, checkPreserved, extractDoc, renderDoc, docText, validateDoc } from '../irp-core/index.js';

test('régressions : négation, condition, modalité et valeurs déplacées sont refusées', async () => {
  const examples = [
    ['Vous ne devez pas payer 50 € avant le 12 novembre.', 'Vous devez payer 50 € avant le 12 novembre.'],
    ['Vous devez payer 50 € avant le 12 novembre.', 'Vous devez payer 50 € après le 12 novembre.'],
    ['Vous devez déposer le dossier.', 'Vous pouvez déposer le dossier.'],
    ['Vous ne devez pas payer. Vous devez signer.', 'Vous devez payer. Vous ne devez pas signer.'],
    ['Le tarif adulte est 50 €. Le tarif enfant est 20 €.', 'Le tarif adulte est 20 €. Le tarif enfant est 50 €.'],
  ];
  for (const [original, adapted] of examples) {
    assert.equal(checkMeaning(original, adapted).ok, false, original);
    assert.notEqual((await adaptText(original, { adapter: () => adapted })).source, 'ai', original);
  }
});

test('les contrôles de valeurs ne confondent pas 50 et 150, 50 et 50,5, Paris et Parisien', () => {
  assert.equal(checkPreserved('Le prix est 50.', 'Le prix est 150.').ok, false);
  assert.equal(checkPreserved('Le prix est 50.', 'Le prix est 50,5.').ok, false);
  assert.equal(checkPreserved('À Paris.', 'Un Parisien.').ok, false);
  assert.equal(checkPreserved('Le prix est 1 200 €.', 'Le prix est 1200 €.').ok, true);
});

test('collage : le HTML est du texte inerte, les paragraphes et listes sont conservés', () => {
  const d = fromPlainText('Mon titre\n\nUn texte avec <script>alert(1)</script>.\n\n- 50 €\n- 12 novembre');
  assert.equal(d.title, 'Mon titre');
  assert.equal(validateDoc(d).ok, true);
  assert.equal(d.blocks[1].type, 'list');
  const window = new JSDOM('<body><div id="root"></div>').window;
  renderDoc(d, window.document.getElementById('root'));
  assert.equal(window.document.querySelector('script'), null);
  assert.match(docText(d), /<script>/);
  assert.throws(() => fromPlainText(' '));
  assert.throws(() => fromPlainText('x'.repeat(1_000_001)));
});

test('préférences : valeurs hostiles ou corrompues bornées, aucun contenu mémorisé', () => {
  const p = readingPrefs({ size: 999, theme: 'bad', font: 'url(x)', simplify: 'true', content: 'secret' });
  assert.equal(p.size, 1.8); assert.equal(p.theme, 'sepia'); assert.equal(p.font, 'serif'); assert.equal(p.simplify, false); assert.equal(p.content, undefined);
  assert.equal(readingPrefs(null).size, 1);
});

test('extraction : bruit retiré sur clone détaché, petits fragments conservés, source intacte', () => {
  const document = new JSDOM('<html lang="fr"><body><main><h1>Tarifs</h1><div class="newsletter"><p>Inscrivez-vous pour 999 €.</p></div><div>50 €</div><p>Un contenu suffisamment long pour sélectionner cette zone comme document principal et conserver tous les tarifs présentés.</p></main></body></html>').window.document;
  const { doc, report } = extractDoc(document);
  assert.doesNotMatch(docText(doc), /999/); assert.match(docText(doc), /50 €/);
  assert.ok(report.dropped); assert.ok(document.querySelector('.newsletter')); assert.ok(report.sourceText);
});

test('comparaison : les textes modifiés sont signalés et la source reste intacte', async () => {
  const original = fromPlainText('Document\n\nVous pouvez solliciter une aide.\n\nLa date reste le 12 novembre.');
  const adapted = (await adaptDoc(original)).doc;
  const rows = compareReading(original, adapted);
  assert.equal(rows.filter((r) => r.changed).length, 1);
  assert.match(rows[1].original, /solliciter/); assert.match(rows[1].adapted, /demander/);
  assert.match(docText(original), /solliciter/);
});

test('rendu embarqué : pas de main imbriqué, pas de h1 ni d’ID dupliqué', () => {
  const document = new JSDOM('<body><main><div id="a"></div><div id="b"></div></main></body>').window.document;
  const d = fromPlainText('Un titre\n\nUn paragraphe qui reste intact.');
  for (const id of ['a', 'b']) renderDoc(d, document.getElementById(id), { embedded: true, idPrefix: id });
  assert.equal(document.querySelectorAll('main').length, 1);
  assert.equal(document.querySelectorAll('h1').length, 0);
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('parser inerte : retire scripts et événements, garde titre, langue et données de liens', async () => {
  const { parseReadingHtml } = await import('../irp-core/index.js');
  const owner = new JSDOM().window.document;
  const parsed = parseReadingHtml('<html lang="en"><head><title>Article</title></head><body onload="evil()"><script>evil()</script><main><h1>Title</h1><p onclick="evil()">Read <a href="/more">more</a>.</p><img src="https://example.org/tracker" onerror="evil()"></main></body></html>', owner);
  assert.equal(parsed.title, 'Article'); assert.equal(parsed.documentElement.lang, 'en');
  assert.equal(parsed.querySelectorAll('script,[onload],[onclick],[onerror]').length, 0);
  assert.equal(parsed.querySelector('a').getAttribute('href'), '/more');
});

test('contrôle rendu : les titres et cellules ne fusionnent pas les valeurs', () => {
  const doc = { irp_doc:'1.0', lang:'fr', title:'Tarifs', blocks:[{type:'table',headers:['Adulte','Enfant'],rows:[['50','20']]}] };
  const document = new JSDOM().window.document;
  const mount = document.createElement('div');
  const r = renderDoc(doc,mount);
  assert.equal(checkPreserved(docText(doc),r.text).ok,true);
  assert.match(r.text,/50 20/);
});

test('long collage : découpé sans perte dans les limites de rendu', () => {
  const raw = 'Un paragraphe long. '.repeat(5000) + 'Montant final : 50 €.';
  const d = fromPlainText(raw);
  assert.equal(validateDoc(d).ok,true);
  assert.ok(d.blocks.length>1);
  assert.match(docText(d),/Montant final : 50 €\./);
  assert.equal(d.blocks.map(b=>b.text).join(''),raw);
});
