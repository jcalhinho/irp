// local.js — démo : modèle local (Gemini Nano ou LFM2.5 via WebGPU) + contrôle IRP de la sortie.
import { detectLocalModels, createLocalAdapter, modelBadge, adaptText, checkPreserved } from '/core/index.js';

const $ = (id) => document.getElementById(id);
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';
let current = null;

const models = detectLocalModels();
for (const m of models) {
  const li = document.createElement('li');
  li.textContent = `${m.label} — ${m.maker}, ${m.runtime} : ${m.available ? 'disponible' : 'indisponible (' + m.reason + ')'}`;
  $('models').appendChild(li);
  if (m.available) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; $('pick').appendChild(o); }
}
if (!$('pick').options.length) {
  $('load').disabled = true;
  $('status').textContent = "Aucun modèle local n'est disponible dans ce navigateur. LFM2.5 demande WebGPU (Chrome ou Edge récents, sur ordinateur) ; Gemini Nano est intégré à Chrome sur ordinateur récent. Safari et Firefox : selon la version. Vous pouvez quand même utiliser la page « Adapter une page » avec les règles, sans modèle.";
}

$('load').addEventListener('click', async () => {
  $('load').disabled = true; $('prog').hidden = false; $('prog').value = 0;
  $('status').textContent = 'Chargement du modèle…';
  const r = await createLocalAdapter($('pick').value, {
    loadTransformers: () => import(TRANSFORMERS),
    onProgress: (p) => { if (p && typeof p.progress === 'number') $('prog').value = p.progress; },
  });
  $('prog').hidden = true; $('load').disabled = false;
  if (!r) { $('status').textContent = 'Chargement impossible (réseau, mémoire ou WebGPU). Réessayez ou choisissez un autre modèle.'; return; }
  current = r; $('go').disabled = false;
  $('status').textContent = `Modèle prêt : ${r.model.label}.`;
});

$('go').addEventListener('click', async () => {
  const text = $('src').value.trim(); if (!text || !current) return;
  $('go').disabled = true; $('status').textContent = 'Le modèle reformule…';
  const rules = await adaptText(text, {});
  $('rules').textContent = rules.text;
  const t0 = performance.now();
  const res = await adaptText(text, { adapter: current.adapter });
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  $('model').textContent = res.text;
  const used = res.source === 'ai';
  $('badge').textContent = used ? modelBadge(current.model) : 'Sortie du modèle rejetée → règles sûres';
  const chk = checkPreserved(text, res.text);
  $('verdict').className = chk.ok ? 'ok' : 'warn';
  $('verdict').textContent = (chk.ok ? '✔ Rien de perdu (nombres, dates, montants, adresses, noms). ' : '⚠ Éléments manquants : ' + chk.missing.join(', ') + '. ')
    + (used ? `Version du modèle acceptée (${secs} s).` : `La version du modèle a été refusée par IRP (${res.reason || 'contrôle'}) : c’est le garde-fou qui travaille.`);
  $('status').textContent = ''; $('go').disabled = false;
});
