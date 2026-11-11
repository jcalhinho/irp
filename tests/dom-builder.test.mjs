// tests/dom-builder.test.mjs — Intégration : le vrai DomBuilder du client avec l'assainisseur
// Usage : cd tests && npm install && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

const dom = new JSDOM('<!doctype html><html><body><div id="irp-root"></div></body></html>');
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
const { DomBuilder } = await import(pathToFileURL(path.join(repo, 'irp-client', 'dom-builder.js')).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ATTACK = '<p id="a" onclick="globalThis.__pwned=1">ok</p><script>globalThis.__pwned = 2</script>' +
  '<img src=x onerror="globalThis.__pwned=3"><a href="javascript:globalThis.__pwned=4">l</a>';

test('plus de code d\'exécution de scripts ni de sanitisation regex dans DomBuilder', () => {
  assert.equal(typeof DomBuilder.prototype._executeScripts, 'undefined');
  assert.equal(typeof DomBuilder.prototype._sanitize, 'undefined');
});

test('setHTML : aucun script exécuté, handlers et javascript: retirés', () => {
  globalThis.__pwned = 0;
  const b = new DomBuilder('irp-root');
  b.setHTML(ATTACK);
  assert.equal(globalThis.__pwned, 0, 'un script a été exécuté');
  assert.equal(b.root.querySelector('script'), null);
  assert.equal(b.root.querySelector('p').hasAttribute('onclick'), false);
  assert.equal(b.root.querySelector('a').hasAttribute('href'), false);
  assert.equal(b.root.querySelector('p').textContent, 'ok');
});

test('inject (avec transition) : même garanties, contenu remplacé et visible', async () => {
  globalThis.__pwned = 0;
  const b = new DomBuilder('irp-root');
  b.inject('<h1>Titre</h1>' + ATTACK);
  await sleep(450);
  assert.equal(globalThis.__pwned, 0);
  assert.equal(b.root.querySelector('h1').textContent, 'Titre');
  assert.equal(b.root.querySelector('script'), null);
  assert.equal(b.root.style.opacity, '1');
});

test('showError / showLoading échappent le texte (pas de HTML injecté)', () => {
  const b = new DomBuilder('irp-root');
  b.showError('<img src=x onerror=alert(1)>', '<script>alert(2)</script>', '<b>détail</b>');
  assert.equal(b.root.querySelector('img'), null);
  assert.equal(b.root.querySelector('script'), null);
  assert.ok(b.root.textContent.includes('<img src=x'));
  b.showLoading('<svg onload=alert(3)>');
  assert.equal(b.root.querySelector('[onload]'), null);
  assert.ok(b.root.textContent.includes('<svg onload'));
});
