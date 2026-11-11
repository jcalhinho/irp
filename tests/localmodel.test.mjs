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
  assert.match(modelBadge(r.model), /LFM2\.5.*local, sur cet appareil.*sortie vérifiée/);
});

test('sans loader ou sans WebGPU : null (jamais d’exception)', async () => {
  assert.equal(await createLocalAdapter('lfm2.5-1.2b', { env: { navigator: { gpu: {} } } }), null);
  assert.equal(await createLocalAdapter('lfm2.5-1.2b', { env: {}, loadTransformers: async () => ({}) }), null);
  assert.equal(await createLocalAdapter('inconnu'), null);
});

test('un petit modèle qui perd un montant est rejeté : le contrat ne dépend pas du modèle', async () => {
  const res = await adaptText('Le montant est de 1 200 € avant le 31 octobre 2027.', { adapter: async () => 'Le montant est élevé, payez bientôt.' });
  assert.notEqual(res.source, 'model');
  assert.match(res.text, /1 200 €/);
});

test('badge sans modèle = règles déterministes', () => assert.match(modelBadge(null), /Règles déterministes/));
