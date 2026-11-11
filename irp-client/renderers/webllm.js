// webllm.js — Renderer utilisant WebLLM (WebGPU + WASM) avec Qwen2.5-0.5B
// Priorité 2 dans la fallback chain — local, pas de réseau

// Modèle WebLLM à utiliser (945MB, le plus léger disponible)
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

// WebLLM est chargé dynamiquement via CDN (pas de build, pas de npm)
let _engine = null;
let _loadingPromise = null;

const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP. Tu génères du HTML à injecter dans un div.

RÈGLES ABSOLUES (ne jamais enfreindre):
1. UNIQUEMENT du HTML. Pas de markdown, pas de texte avant/après.
2. TOUT le CSS doit être dans une balise <style> inline. JAMAIS de <link> ou attribut href vers un fichier CSS.
3. AUCUN JavaScript : ni <script>, ni attributs on*. Interactions en HTML/CSS pur (details/summary, :hover, :focus-within, input:checked, :target).
4. Pas de DOCTYPE, pas de <html>, pas de <head>, pas de <body>.
5. Commence directement par <style> ou une balise <div>.
6. Design moderne: dark mode (#0a0a14), CSS variables, Grid/Flexbox, border-radius, gradients.
7. Responsive: mobile-first, media queries.
8. SVG inline pour les icônes. Pas d'<img> avec src externe.
9. Accessible: sémantique HTML5 (section, article, nav, button), ARIA si besoin.
10. Si reducedMotion: pas d'animations. Si contrast high: contrastes forts.

EXEMPLE de structure de réponse:
<style>:root{--bg:#0a0a14;--accent:#4CAF50}body{...}</style>
<div class="container">...</div>
<details><summary>Plus</summary><p>Contenu</p></details>`;

export class WebLLMRenderer {
  getName() {
    return 'WebLLM (Qwen2.5-0.5B)';
  }

  /**
   * Vérifie si WebLLM est disponible : WebGPU requis.
   */
  async isAvailable() {
    return 'gpu' in navigator;
  }

  /**
   * Génère du HTML à partir d'un IRP + contexte via WebLLM.
   * @param {Object} irp — L'objet IRP reçu du serveur
   * @param {Object} context — Le contexte utilisateur détecté
   * @returns {Promise<string>} HTML généré
   */
  async render(irp, context) {
    const engine = await this._getEngine();

    const prompt = this._buildPrompt(irp, context);

    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const content = reply.choices[0].message.content;
    return this._cleanOutput(content);
  }

  // ─── Chargement du moteur WebLLM ─────────────────────────

  async _getEngine() {
    if (_engine) return _engine;
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = this._loadEngine();
    _engine = await _loadingPromise;
    _loadingPromise = null;
    return _engine;
  }

  async _loadEngine() {
    // Charge WebLLM depuis CDN (ESM)
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');

    // Crée le moteur avec callback de progression
    _engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        console.log(`[WebLLM] ${progress.text} (${Math.round((progress.progress || 0) * 100)}%)`);
      },
    });

    return _engine;
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

    // Enlève les <link> externes (le CSS doit être inline)
    content = content.replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');
    content = content.replace(/<link[^>]*href=["']?[^"']*\.css["']?[^>]*>/gi, '');

    // Enlève les <script src="..."> externes
    content = content.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '');

    // Enlève les <img src="http..."> externes (remplace par placeholder)
    content = content.replace(/<img[^>]*src=["']https?:\/\/[^"']*["'][^>]*>/gi, '<div style="width:100%;height:200px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#555;font-size:14px;">🖼️ Image</div>');

    return content.trim();
  }
}
