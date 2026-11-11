// localmodel.js — Modèles LOCAUX utilisables comme « adaptateur » de texte, et affichage du modèle réellement utilisé.
// Principe IRP : un modèle (même petit, même local) ne produit jamais de HTML ; il reformule du texte, et sa sortie
// est vérifiée par adaptText/verifyPreserved. Le modèle est interchangeable : le contrat de sécurité ne dépend pas de lui.
// Aucun réseau ici : le chargement de la bibliothèque d'inférence (transformers.js) est fourni par la page hôte.

export const SYSTEM_PROMPT = "Tu réécris des textes en français très simple (FALC) : phrases courtes, mots courants, une idée par phrase. "
  + "Tu conserves EXACTEMENT tous les nombres, dates, montants, noms et adresses. Tu réponds uniquement par le texte réécrit, sans balises.";

/** Modèles connus. `hf` = identifiant Hugging Face (ONNX, q4) lisible par transformers.js. */
export const MODEL_CATALOG = [
  { id: 'chrome-builtin', label: 'Gemini Nano (intégré à Chrome)', maker: 'Google', runtime: 'Chrome Prompt API' },
  { id: 'lfm2.5-1.2b', label: 'LFM2.5-1.2B-Instruct', maker: 'Liquid AI', runtime: 'WebGPU (transformers.js)', hf: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX', dtype: 'q4' },
];

const promptApi = (env) => (env.LanguageModel || (env.ai && env.ai.languageModel)) || null;

/** Quels modèles locaux ce navigateur peut-il faire tourner ? (sans rien télécharger) */
export function detectLocalModels(env = globalThis) {
  const gpu = !!(env.navigator && env.navigator.gpu);
  return MODEL_CATALOG.map((m) => {
    if (m.id === 'chrome-builtin') { const ok = !!promptApi(env); return { ...m, available: ok, reason: ok ? undefined : "API d'IA intégrée absente de ce navigateur" }; }
    return { ...m, available: gpu, reason: gpu ? undefined : 'WebGPU indisponible' };
  });
}

/** Texte à afficher : toujours dire QUEL modèle a travaillé, et où. */
export function modelBadge(m, source = 'local') {
  if (!m) return 'Règles déterministes (aucun modèle)';
  return `${m.label} · ${source === 'local' ? 'local, sur cet appareil' : source} · sortie vérifiée`;
}

/**
 * Crée un adaptateur pour adaptText/adaptDoc : { model, adapter } ou null si indisponible.
 * @param {string} id  identifiant du catalogue
 * @param {{env?:object, loadTransformers?:()=>Promise<object>, onProgress?:(p:any)=>void}} [opts]
 */
export async function createLocalAdapter(id, opts = {}) {
  const env = opts.env || globalThis;
  const model = detectLocalModels(env).find((m) => m.id === id);
  if (!model || !model.available) return null;
  try {
    if (id === 'chrome-builtin') {
      const LM = promptApi(env);
      const session = await LM.create({ initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }] });
      return { model, adapter: (t) => session.prompt(t) };
    }
    if (typeof opts.loadTransformers !== 'function') return null;
    const T = await opts.loadTransformers();
    const tokenizer = await T.AutoTokenizer.from_pretrained(model.hf);
    const lm = await T.AutoModelForCausalLM.from_pretrained(model.hf, { device: 'webgpu', dtype: model.dtype || 'q4', progress_callback: opts.onProgress });
    const adapter = async (text) => {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }];
      const input = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true });
      const out = await lm.generate({ ...input, max_new_tokens: 512, do_sample: false });
      // transformers.js renvoie un Tensor [1, n] (champ .data) ; les anciennes versions, un tableau de séquences.
      const ids = out && out.data ? Array.from(out.data) : Array.from(out[0] || out);
      const start = input.input_ids.dims[input.input_ids.dims.length - 1];
      return tokenizer.decode(ids.slice(start), { skip_special_tokens: true }).trim();
    };
    return { model, adapter };
  } catch { return null; }
}
