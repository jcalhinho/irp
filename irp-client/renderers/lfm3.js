// lfm3.js — Renderer utilisant LFM3-1.7B (Liquid AI) via ONNX Runtime Web
// Priorité 3 dans la fallback chain — local, alternative à WebLLM
//
// LFM3-1.7B : architecture tri-hybride, ~1GB en 4-bit, 256K contexte
// Tool calling natif + structured outputs
// Checkpoints ONNX : https://huggingface.co/LiquidAI/LFM3-1.7B
// Space WASM de référence : fusorlabs/liquidai-lmf3-wasm

// Configuration du modèle
const MODEL_CONFIG = {
  // URL du modèle ONNX quantifié (à héberger ou via HuggingFace CDN)
  modelUrl: 'https://huggingface.co/LiquidAI/LFM3-1.7B/resolve/main/onnx/model_q4.onnx',
  modelName: 'LFM3-1.7B',
  // Configuration du tokenizer (à adapter selon le format disponible)
  tokenizerUrl: 'https://huggingface.co/LiquidAI/LFM3-1.7B/resolve/main/tokenizer.json',
  // Paramètres de génération
  maxTokens: 4096,
  temperature: 0.7,
};

// ONNX Runtime Web est chargé dynamiquement via CDN
let _session = null;
let _tokenizer = null;
let _loadingPromise = null;

const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP (Intent Rendering Protocol).
Tu reçois un intent (ce qu'il faut afficher), des données, et le contexte de l'utilisateur.
Tu DOIS générer UNIQUEMENT du HTML5 valide avec CSS et JS inline.

Règles STRICTES:
1. Réponds avec du HTML prêt à être injecté dans un <div> (pas de DOCTYPE, pas de <html>, pas de <head>, pas de <body>).
2. NE mets PAS de markdown, pas d'explication. UNIQUEMENT le HTML.
3. Le design doit être moderne, responsive et soigné. Utilise CSS Grid/Flexbox, des variables CSS.
4. Adapte le design au CONTEXTE fourni : thème (dark/light), taille d'écran, accessibilité, langue.
5. Si reducedMotion est true, n'utilise pas d'animations.
6. Si contrast est "high", utilise des contrastes élevés.
7. Si screenReader est true, utilise des attributs ARIA et une structure sémantique.
8. N'inclus AUCUNE ressource externe (pas de CDN, pas de Google Fonts). Tout doit être self-contained.
9. Pour les images, utilise des SVG inline ou des placeholders CSS.
10. Le JS doit être fonctionnel et améliorer l'expérience.`;

export class LFM3Renderer {
  getName() {
    return 'LFM3-1.7B (Liquid AI)';
  }

  /**
   * Vérifie si LFM3 peut tourner : WebGPU ou WASM threads requis.
   * ONNX Runtime Web supporte WebGPU et WASM.
   */
  async isAvailable() {
    // ONNX Runtime Web peut utiliser WebGPU ou WASM (fallback)
    // On vérifie au minimum que les APIs nécessaires sont présentes
    const hasWebGPU = 'gpu' in navigator;
    const hasWasmSIMD = await this._checkWasmSupport();
    return hasWebGPU || hasWasmSIMD;
  }

  /**
   * Génère du HTML à partir d'un IRP + contexte via LFM3.
   * @param {Object} irp — L'objet IRP reçu du serveur
   * @param {Object} context — Le contexte utilisateur détecté
   * @returns {Promise<string>} HTML généré
   */
  async render(irp, context) {
    const { session, tokenizer } = await this._getEngine();

    const prompt = this._buildPrompt(irp, context);

    // Tokenisation du prompt
    const fullPrompt = `<|system|>\n${SYSTEM_PROMPT}\n<|user|>\n${prompt}\n<|assistant|>\n`;
    const tokens = await tokenizer.encode(fullPrompt);

    // Génération token par token
    const outputTokens = await this._generate(session, tokens, MODEL_CONFIG.maxTokens);

    // Décodage
    const content = await tokenizer.decode(outputTokens);

    return this._cleanOutput(content);
  }

  // ─── Chargement du moteur LFM3 ───────────────────────────

  async _getEngine() {
    if (_session && _tokenizer) return { session: _session, tokenizer: _tokenizer };
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = this._loadEngine();
    const result = await _loadingPromise;
    _loadingPromise = null;
    return result;
  }

  async _loadEngine() {
    console.log('[LFM3] Chargement d\'ONNX Runtime Web…');

    // Charge ONNX Runtime Web depuis CDN
    const ort = await import('https://esm.run/onnxruntime-web');

    // Configure le backend (WebGPU en priorité, WASM en fallback)
    if ('gpu' in navigator) {
      ort.env.backend = 'webgpu';
      console.log('[LFM3] Backend: WebGPU');
    } else {
      ort.env.backend = 'wasm';
      ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
      console.log('[LFM3] Backend: WASM');
    }

    console.log('[LFM3] Téléchargement du modèle (~1GB)…');

    // Crée la session ONNX
    _session = await ort.InferenceSession.create(MODEL_CONFIG.modelUrl, {
      executionProviders: ['gpu' in navigator ? 'webgpu' : 'wasm'],
      graphOptimizationLevel: 'all',
    });

    console.log('[LFM3] Modèle chargé. Téléchargement du tokenizer…');

    // Charge le tokenizer
    _tokenizer = await this._loadTokenizer();

    console.log('[LFM3] ✅ Prêt');

    return { session: _session, tokenizer: _tokenizer };
  }

  async _loadTokenizer() {
    // Utilise @anthropic-ai/tokenizer ou un tokenizer simple
    // Pour le POC, on utilise une approche simplifiée
    try {
      const { Tokenizer } = await import('https://esm.run/@anthropic-ai/tokenizer');
      const tokenizer = await Tokenizer.fromPretrained('LiquidAI/LFM3-1.7B');
      return {
        encode: async (text) => tokenizer.encode(text),
        decode: async (tokens) => tokenizer.decode(tokens),
      };
    } catch (e) {
      console.warn('[LFM3] Tokenizer spécialisé non disponible, fallback basique');
      // Fallback : tokenizer basique par caractère (très approximatif)
      return {
        encode: async (text) => Array.from(text).map(c => c.charCodeAt(0)),
        decode: async (tokens) => tokens.map(t => String.fromCharCode(t)).join(''),
      };
    }
  }

  /**
   * Génération autoregressive token par token.
   * Boucle simple : feed-forward, argmax, repeat.
   */
  async _generate(session, inputTokens, maxTokens) {
    const outputTokens = [...inputTokens];
    const eosToken = 2; // Token de fin (à adapter selon le tokenizer LFM3)

    for (let i = 0; i < maxTokens; i++) {
      // Prépare les inputs pour la session ONNX
      const feeds = {
        input_ids: new ort.Tensor('int64', BigInt64Array.from(outputTokens.map(t => BigInt(t))), [1, outputTokens.length]),
        attention_mask: new ort.Tensor('int64', BigInt64Array.from(outputTokens.map(() => BigInt(1))), [1, outputTokens.length]),
      };

      // Run inference
      const results = await session.run(feeds);

      // Récupère les logits du dernier token
      const logits = results.logits.data;
      const lastTokenLogits = logits.slice((outputTokens.length - 1) * logits.length / outputTokens.length);

      // Argmax (greedy decoding — pour le POC)
      const nextToken = this._argmax(lastTokenLogits);

      if (nextToken === eosToken) break;
      outputTokens.push(nextToken);

      // Log de progression tous les 50 tokens
      if (i % 50 === 0) {
        console.log(`[LFM3] Génération: ${i} tokens…`);
      }
    }

    // Retourne seulement les tokens générés (pas le prompt)
    return outputTokens.slice(inputTokens.length);
  }

  _argmax(arr) {
    let maxIdx = 0;
    let maxVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  async _checkWasmSupport() {
    try {
      // Vérifie le support WASM SIMD threads
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  _buildPrompt(irp, context) {
    const constraints = irp.constraints || {};

    return `INSTRUCTION DE RENDU IRP
========================

Intent: ${irp.intent}
Priorité: ${constraints.priority || 'normal'}
Type de contenu: ${constraints.content_type || 'general'}
Doit afficher obligatoirement: ${JSON.stringify(constraints.must_show || [])}

DONNÉES À AFFICHER:
${JSON.stringify(irp.data, null, 2)}

CONTEXTE UTILISATEUR:
- Écran: ${context.screen.viewportWidth}x${context.screen.viewportHeight}, DPR ${context.screen.dpr}, ${context.device.type}
- Thème: ${context.prefs.theme}
- Langue: ${context.prefs.lang}
- Accessibilité: contraste=${context.a11y.contrast}, reducedMotion=${context.a11y.reducedMotion}, screenReader=${context.a11y.screenReader}, fontSize=${context.a11y.fontSize}
- Réseau: ${context.network.type}
- Batterie: ${context.battery.level !== null ? Math.round(context.battery.level * 100) + '%' : '?'}

Génère le HTML optimal pour CET utilisateur, CET appareil, CE contexte.`;
  }

  _cleanOutput(content) {
    content = content.trim();

    // Nettoyage markdown
    if (content.startsWith('```')) {
      const lines = content.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      content = lines.join('\n').trim();
    }

    // Enlève les wrappers HTML
    content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
    content = content.replace(/<\/?html[^>]*>/gi, '');
    content = content.replace(/<\/?head[^>]*>/gi, '');
    content = content.replace(/<\/?body[^>]*>/gi, '');

    return content.trim();
  }
}
