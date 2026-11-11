// chrome-api.js — Renderer utilisant Chrome Prompt API (Gemini Nano natif)
// Priorité 1 dans la fallback chain — le plus rapide (~200ms)

const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP (Intent Rendering Protocol).
Tu reçois un intent (ce qu'il faut afficher), des données, et le contexte de l'utilisateur.
Tu DOIS générer UNIQUEMENT du HTML5 valide avec CSS inline (<style>), SANS JavaScript (ni <script> ni attributs on*).

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
10. N'écris aucun JavaScript : il serait supprimé.`;

export class ChromeAPIRenderer {
  getName() {
    return 'Chrome Prompt API (Gemini Nano)';
  }

  /**
   * Vérifie si Chrome Prompt API est disponible.
   * Chrome 138+ (extensions) ou Chrome 148+ (web).
   */
  async isAvailable() {
    // API moderne : LanguageModel
    if ('LanguageModel' in window) {
      try {
        const capabilities = await LanguageModel.availability();
        return capabilities === 'available' || capabilities === 'downloadable';
      } catch (e) {
        return false;
      }
    }
    // API legacy : window.ai
    if ('ai' in window && window.ai?.languageModel) {
      try {
        const capabilities = await window.ai.languageModel.capabilities();
        return capabilities.available === 'readily' || capabilities.available === 'after-download';
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /**
   * Génère du HTML à partir d'un IRP + contexte via Gemini Nano.
   * @param {Object} irp — L'objet IRP reçu du serveur
   * @param {Object} context — Le contexte utilisateur détecté
   * @returns {Promise<string>} HTML généré
   */
  async render(irp, context) {
    const prompt = this._buildPrompt(irp, context);

    // Essayer l'API moderne (LanguageModel) d'abord
    if ('LanguageModel' in window) {
      return await this._renderModern(prompt);
    }

    // Fallback sur l'API legacy (window.ai)
    if ('ai' in window && window.ai?.languageModel) {
      return await this._renderLegacy(prompt);
    }

    throw new Error('Chrome Prompt API non disponible');
  }

  // ─── API moderne (LanguageModel) ─────────────────────────

  async _renderModern(prompt) {
    const session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      // responseConstraint: tenter de forcer du HTML (si supporté)
    });

    try {
      // Streaming : on accumule les chunks
      let result = '';
      const stream = session.promptStreaming(prompt);

      for await (const chunk of stream) {
        result += chunk;
      }

      return this._cleanOutput(result);
    } finally {
      session.destroy?.();
    }
  }

  // ─── API legacy (window.ai) ──────────────────────────────

  async _renderLegacy(prompt) {
    const session = await window.ai.languageModel.create({
      systemPrompt: SYSTEM_PROMPT,
    });

    try {
      const result = await session.prompt(prompt);
      return this._cleanOutput(result);
    } finally {
      session.destroy?.();
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

    // Nettoyage markdown si présent
    if (content.startsWith('```')) {
      const lines = content.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      content = lines.join('\n').trim();
    }

    // Enlève les wrappers HTML si l'IA les a mis
    content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
    content = content.replace(/<\/?html[^>]*>/gi, '');
    content = content.replace(/<\/?head[^>]*>/gi, '');
    content = content.replace(/<\/?body[^>]*>/gi, '');

    return content.trim();
  }
}
