import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLocalModels, createLocalAdapter, modelBadge, adaptText } from '../irp-core/index.js';

test('détection : rien sans API ni WebGPU', () => {
  const r = detectLocalModels({});
  assert.ok(r.every((m) => !m.available && m.reason));
});

test('détection : WebGPU active le modèle LFM, Prompt API active Gemini Nano', () => {
  assert.equal(detectLocalModels({ navigator: { gpu: {} } }).find((m) => m.id === 'lfm2.5-1.2b').available, true);
  assert.equal(detectLocalModels({ LanguageModel: { create() {} } }).find((m) => m.id === 'chrome-builtin').available, true);
});

test('LFM via transformers.js (simulé) : adaptateur utilisable, modèle nommé', async () => {
  const calls = [];
  const T = {
    AutoTokenizer: { from_pretrained: async (id) => { calls.push(id); return {
      apply_chat_template: () => ({ input_ids: { dims: [1, 3] } }),
      decode: (seq) => seq.join(' '),
    }; } },
    AutoModelForCausalLM: { from_pretrained: async (id, o) => { calls.push(o.device + '/' + o.dtype); return { generate: async () => [[1, 2, 3, 'Paie', '25', '€']] }; } },
  };
  const r = await createLocalAdapter('lfm2.5-1.2b', { env: { navigator: { gpu: {} } }, loadTransformers: async () => T });
  assert.equal(r.model.hf, 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX');
  assert.deepEqual(calls, ['LiquidAI/LFM2.5-1.2B-Instruct-ONNX', 'webgpu/q4']);
  assert.equal(await r.adapter('x'), 'Paie 25 €');
  assert.match(modelBadge(r.model), /LFM2\.5.*local, sur cet appareil.*contrôles heuristiques/);
});

test('sans loader ou sans WebGPU : null (jamais d’exception)', async () => {
  assert.equal(await createLocalAdapter('lfm2.5-1.2b', { env: { navigator: { gpu: {} } } }), null);
  assert.equal(await createLocalAdapter('lfm2.5-1.2b', { env: {}, loadTransformers: async () => ({}) }), null);
  assert.equal(await createLocalAdapter('inconnu'), null);
});

test('un petit modèle qui perd un montant est rejeté : le contrat ne dépend pas du modèle', async () => {
  const res = await adaptText('Le montant est de 1 200 € avant le 31 octobre 2027.', { adapter: async () => 'Le montant est élevé, payez bientôt.' });
  assert.equal(res.source, 'rules');
  assert.match(res.reason, /^ia-perte/);
  assert.match(res.text, /1 200 €/);
  const ok = await adaptText('Le montant est de 1 200 € avant le 31 octobre 2027.', { adapter: async (t) => t });
  assert.equal(ok.source, 'ai');
});

test('badge sans modèle = règles déterministes', () => assert.match(modelBadge(null), /Règles déterministes/));

test('LFM : sortie sous forme de Tensor (.data) — cas réel de transformers.js 4.x', async () => {
  const T = {
    AutoTokenizer: { from_pretrained: async () => ({ apply_chat_template: () => ({ input_ids: { dims: [1, 2] } }), decode: (ids) => ids.map(String).join(' ') }) },
    AutoModelForCausalLM: { from_pretrained: async () => ({ generate: async () => ({ dims: [1, 5], data: BigInt64Array.from([1n, 2n, 7n, 8n, 9n]) }) }) },
  };
  const r = await createLocalAdapter('lfm2.5-1.2b', { env: { navigator: { gpu: {} } }, loadTransformers: async () => T });
  assert.equal(await r.adapter('x'), '7 8 9');
});

import { checkAdditions } from '../irp-core/index.js';
const ORIG = "Afin de bénéficier de l'aide annuelle de 1 200 €, il convient de déposer votre dossier auprès de la Caisse des Écoles avant le 31 octobre 2027, faute de quoi celui-ci sera rejeté. Contact : aides@ville-exemple.fr";

test('ajouts : la sortie réelle de LFM2.5 (phrases inventées) est refusée', async () => {
  const lfm = "Il faut déposer le dossier avant le 31 octobre 2027.  \nAppeler aides@ville-exemple.fr.  \nApportez les documents.  \nLe montant est 1 200 €.  \nLa date limite est le 31 octobre.  \nNe pas tarder.";
  const r = checkAdditions(ORIG, lfm);
  assert.equal(r.ok, false);
  const res = await adaptText(ORIG, { adapter: async () => lfm });
  assert.equal(res.source, 'rules');
});

test('ajouts : une simplification fidèle (synonymes, phrases courtes) passe', () => {
  const ok = "Pour avoir l'aide annuelle de 1 200 €, déposez votre dossier à la Caisse des Écoles avant le 31 octobre 2027. Sinon, il sera rejeté. Contact : aides@ville-exemple.fr";
  assert.equal(checkAdditions(ORIG, ok).ok, true);
});

test('ajouts : un chiffre, une adresse ou un nom inventé est refusé', () => {
  assert.equal(checkAdditions(ORIG, ORIG + ' Appelez le 0145678901.').ok, false);
  assert.equal(checkAdditions(ORIG, ORIG + ' Écrivez à contact@autre.fr').ok, false);
  assert.equal(checkAdditions(ORIG, ORIG + ' Voir Mairie de Lyon').ok, false);
});
