// Contrat serveur → client : chaque document IRP-Doc produit par le serveur Python doit être
// accepté par le validateur JS, rendu sans erreur, et tenir sa promesse `must_show`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { JSDOM } from 'jsdom';
import { validateDoc, renderDoc, verifyMustShow, toMarkdown } from '../irp-core/index.js';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PY = `
import json, sys
sys.path.insert(0, "irp-server")
import irpdoc
from intents import show_product, read_article, show_dashboard, show_catalog, show_pricing, fill_form, browse_list, show_chat
P = json.load(open("irp-server/data/products.json")); A = json.load(open("irp-server/data/articles.json")); D = json.load(open("irp-server/data/dashboard.json"))
envs = [show_product.build(p) for p in P] + [read_article.build(a) for a in A] + [show_dashboard.build(D), show_catalog.build(), show_pricing.build(), fill_form.build("contact"), browse_list.build("tasks"), show_chat.build()]
envs.append({"irp": {"version": "1.0", "intent": "show_error", "data": {"status": "404", "message": "Route introuvable", "links": [{"label": "Accueil", "href": "/"}]}}})
out = []
for e in envs:
    d = irpdoc.irp_to_doc(e, "/x")
    out.append({"doc": d, "md": irpdoc.to_markdown(d)})
print(json.dumps(out, ensure_ascii=False))
`;
const docs = JSON.parse(execFileSync('python3', ['-c', PY], { cwd: root, encoding: 'utf8' }));

test('le serveur produit des documents pour tous les intents', () => { assert.ok(docs.length >= 12, String(docs.length)); });

for (const [i, { doc, md }] of docs.entries()) {
  test(`contrat #${i} « ${doc.title.slice(0, 40)} » : valide, rendu, must_show tenu, Markdown identique côté JS`, () => {
    const v = validateDoc(doc);
    assert.equal(v.ok, true, v.errors.join(' ; '));
    const c = new JSDOM('<body></body>').window.document.body;
    const r = renderDoc(doc, c, { profile: 'falc' });
    assert.equal(r.ok, true);
    const m = verifyMustShow(doc.must_show || [], r.text);
    assert.equal(m.ok, true, 'manquants : ' + m.missing.join(', '));
    assert.equal(toMarkdown(doc).trim(), md.trim(), 'les deux implémentations Markdown (Python/JS) doivent produire le même texte');
  });
}
