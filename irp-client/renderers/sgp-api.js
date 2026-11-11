// sgp-api.js — Renderer utilisant claude-qwen via SGP LLMaaS
// Version 2: prompt optimisé par intent, nettoyage robuste, streaming-ready

const SGP_MODEL = 'claude-qwen';

let _proxyUrl = null;
let _proxyToken = '';

// Jeton du proxy (optionnel). La clé API SGP n'existe QUE côté serveur.
export function setProxyToken(token) {
  _proxyToken = token || '';
}

export function setProxyUrl(url) {
  _proxyUrl = url;
}

// ─── Prompts par intent ─────────────────────────────────────────────────────

const INTENT_PROMPTS = {
  show_landing: `Génère une landing page marketing percutante. Structure: hero avec titre + tagline + 2 CTA, section features (3-4 cartes avec icône SVG), section "comment ça marche" (3 étapes), témoignage ou stats, CTA final. Design: gradient subtil, animations CSS au hover, typographie hiérarchisée. Le but est de convaincre et convertir.`,

  show_product: `Génère une fiche produit e-commerce. Structure: galerie (placeholder SVG), titre, prix mis en avant, badges (promo/nouveau), specs en tableau, description, bouton "Ajouter au panier" (primary), bouton "Favoris" (secondary), avis clients (étoiles SVG). Design: mise en page 2 colonnes (image | infos), prix en grand, CTA visible. Le but est la conversion.`,

  read_article: `Génère un article de blog lisible. Structure: titre H1, meta (auteur, date, temps de lecture), image hero (SVG), contenu avec H2/H3/puces/citations, liens internes, footer auteur. Design: largeur de lecture max 680px, typographie optimisée (line-height 1.7, font 16-18px), drop cap optionnelle. Le but est la lecture confortable.`,

  show_dashboard: `Génère un tableau de bord analytique. Structure: sidebar navigation, header avec titre + filtres, 4 KPI cards (valeur + variation + sparkline SVG), 2 graphiques (bar/line en SVG), table de données récente. Design: grille propre, couleurs sémantiques (vert=up, rouge=down), hover states. Le but est la clarté des données.`,

  show_catalog: `Génère un catalogue produits avec filtres. Structure: sidebar filtres (catégorie, prix, tri), grille de produits (3-4 colonnes), chaque carte = image SVG + nom + prix + bouton. Design: cartes uniformes, hover effect, filtres en HTML/CSS (formulaire GET). Le but est la navigation efficace.`,

  fill_form: `Génère un formulaire moderne. Structure: titre, champs avec labels flottants, validation visuelle (bordures vertes/rouges), champs requis marqués, bouton submit (primary), lien secondaire. Design: un champ par ligne, largeur max 480px, focus states, messages d'aide. Le but est la complétion sans friction.`,

  browse_list: `Génère une liste de tâches/items interactive. Structure: header avec compteur, filtres (tous/actifs/complétés), liste avec checkboxes, actions (supprimer, éditer), bouton "ajouter". Design: items avec hover, transitions, état complété barré. Le but est la gestion rapide.`,

  show_pricing: `Génère un tableau de tarifs. Structure: 3 plans (Free, Pro, Enterprise), chaque plan = prix + features + CTA, plan du milieu mis en avant (border + badge "Popular"). Design: cartes alignées, prix en grand, features avec icônes check/cross, hover effect. Le but est la conversion vers le plan payant.`,

  show_chat: `Génère une interface de chat. Structure: header avec avatar + nom, zone messages (bulles gauche/droite), input en bas avec bouton send. Design: bulles arrondies, timestamps, auto-scroll, animations d'apparition. Le but est la conversation fluide.`,

  show_error: `Génère une page d'erreur 404. Structure: gros numéro 404, message d'erreur, illustration SVG, bouton retour accueil, liens suggérés. Design: centré, illustration créative, ton léger. Le but est de rassurer et rediriger.`,

  show_profile: `Génère un profil utilisateur. Structure: avatar (SVG ou initiales), nom + bio, stats (abonnés, posts), bouton follow, onglets (posts, médias, à propos). Design: header avec cover, avatar circulaire, grille de contenu. Le but est la présentation sociale.`,

  show_search: `Génère une interface de recherche. Structure: barre de recherche centrée (grand input), filtres rapides, résultats en liste avec snippets, pagination. Design: focus sur l'input, résultats avec highlight, loading state. Le but est la trouvabilité.`,

  play_media: `Génère un lecteur média. Structure: zone vidéo/audio (placeholder SVG), contrôles (play/pause/seek/volume/fullscreen), playlist latérale, infos titre/artiste. Design: contrôles overlay, barre de progression, design cinématique. Le but est l'immersion.`,

  show_map: `Génère une interface cartographique. Structure: zone carte (placeholder SVG grid), sidebar avec liste de lieux, filtres, markers. Design: plein écran, panel flottant, markers colorés. Le but est la navigation spatiale.`,

  show_docs: `Génère une documentation technique. Structure: sidebar sommaire, contenu avec H2/H3/code blocks, recherche, navigation prev/next. Design: typo monospace pour code, coloration syntaxique simulée, largeur de lecture. Le but est la référence rapide.`,
};

const DEFAULT_PROMPT = `Génère une interface web moderne et fonctionnelle adaptée à l'intent fourni. Structure sémantique HTML5, design soigné, interactions en CSS pur (details/summary, :hover).`;

// ─── Prompt système commun ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un moteur de rendu IRP (Intent Rendering Protocol) de qualité professionnelle.
Tu reçois un intent, des données, et le contexte utilisateur. Tu génères UNIQUEMENT du HTML.

RÈGLES ABSOLUES:
1. Réponds avec du HTML5 uniquement. PAS de markdown, PAS d'explication, PAS de texte avant/après.
2. Le HTML sera injecté dans un <div>. Ne mets PAS de <!DOCTYPE>, <html>, <head> ou <body>.
3. Tout le CSS doit être dans une balise <style> inline. JAMAIS de <link rel="stylesheet">.
4. AUCUN JavaScript : ni <script>, ni attributs on*. Interactions en HTML/CSS pur (details/summary, :hover, :focus-within, input:checked, :target).
5. AUCUNE ressource externe: pas de CDN, pas de Google Fonts, pas d'images distantes.
6. Pour les images, utilise des SVG inline ou des dégradés CSS.
7. Design: dark mode avec fond #0a0a14, surfaces #12122a, accent #00E676, texte #f0f0f5.
8. Utilise CSS variables, Grid/Flexbox, transitions, border-radius 12px.
9. Responsive: utilise clamp() pour les tailles fluides, media queries si nécessaire.
10. Accessibilité: structure sémantique (section, article, nav, button), ARIA si besoin.
11. Si reducedMotion: pas d'animations. Si contrast "high": contrastes élevés.
12. Tout script serait supprimé : n'en écris pas.
13. Sois créatif mais professionnel. Le design doit être bluffant.

EXEMPLE de structure attendue:
<style>:root{--bg:#0a0a14;--accent:#00E676;...}.card{background:var(--bg);...}</style>
<section class="hero"><h1>Titre</h1><p>Description</p><button>CTA</button></section>
<details><summary>Plus</summary><p>Contenu</p></details>`;

// ─── Renderer ───────────────────────────────────────────────────────────────

export class SGPRenderer {
  getName() {
    return 'SGP API (claude-qwen)';
  }

  async isAvailable() {
    return !!_proxyUrl;
  }

  /**
   * Génère du HTML à partir d'un IRP + contexte.
   * @param {Object} irp — L'objet IRP reçu du serveur
   * @param {Object} context — Le contexte utilisateur détecté
   * @param {Function} onChunk — Callback pour streaming (optionnel)
   * @returns {Promise<string>} HTML généré
   */
  async render(irp, context, onChunk = null) {
    if (!_proxyUrl) {
      throw new Error('Aucune URL de proxy SGP configurée');
    }

    const userPrompt = this._buildPrompt(irp, context);

    const body = JSON.stringify({
      model: SGP_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: !!onChunk,
    });

    const response = await fetch(_proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_proxyToken ? { 'X-IRP-Token': _proxyToken } : {}),
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SGP API Error ${response.status}: ${errText.substring(0, 200)}`);
    }

    let content;

    if (onChunk && response.body) {
      // Mode streaming
      content = await this._readStream(response, onChunk);
    } else {
      // Mode standard
      const data = await response.json();
      content = data.choices[0].message.content.trim();
    }

    return this._cleanOutput(content);
  }

  /**
   * Lit un stream SSE et appelle onChunk pour chaque morceau.
   */
  async _readStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk(delta, fullContent);
            }
          } catch (e) {
            // Ligne partielle, on ignore
          }
        }
      }
    }

    return fullContent.trim();
  }

  /**
   * Nettoie la sortie: markdown, DOCTYPE, tags externes.
   */
  _cleanOutput(content) {
    // Nettoyage markdown si l'IA a quand même mis des délimiteurs
    if (content.startsWith('```')) {
      const lines = content.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
      content = lines.join('\n').trim();
    }

    // Enlève DOCTYPE et tags structurels (on injecte dans un div)
    content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
    content = content.replace(/<\/?html[^>]*>/gi, '');
    content = content.replace(/<\/?head[^>]*>/gi, '');
    content = content.replace(/<\/?body[^>]*>/gi, '');

    // Supprime les <link> CSS externes
    content = content.replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');
    content = content.replace(/<link[^>]*href=["']?[^"']*\.css["']?[^>]*>/gi, '');

    // Supprime les <script src="..."> externes
    content = content.replace(/<script[^>]*\ssrc=["'][^"']*["'][^>]*><\/script>/gis, '');

    // Remplace les <img src="http..."> par des placeholders
    content = content.replace(/<img([^>]*)src=["']https?:\/\/[^"']*["']([^>]*)>/gi,
      '<div$1style="min-height:120px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#555;font-size:2em;"$2>🖼️</div>');

    return content.trim();
  }

  _buildPrompt(irp, context) {
    const intent = irp.intent;
    const data = irp.data;
    const constraints = irp.constraints || {};
    const intentPrompt = INTENT_PROMPTS[intent] || DEFAULT_PROMPT;

    // Construire la liste des actions si présentes
    let actionsStr = '';
    if (irp.actions && irp.actions.length > 0) {
      actionsStr = '\nACTIONS (boutons/liens à inclure):\n' +
        irp.actions.map(a => `- ${a.label} (${a.type || 'button'}, href: ${a.href || 'N/A'}, method: ${a.method || 'GET'})`).join('\n');
    }

    // Construire les metadata si présentes
    let metaStr = '';
    if (irp.metadata) {
      metaStr = `\nMétadonnées: titre="${irp.metadata.title || ''}", langue="${irp.metadata.lang || context.prefs.lang}"`;
    }

    return `INTENT: ${intent}
${metaStr}

INSTRUCTION SPÉCIFIQUE:
${intentPrompt}

DONNÉES À AFFICHER:
${JSON.stringify(data, null, 2)}

CONTRAINTES:
- Priorité: ${constraints.priority || 'normal'}
- Type de contenu: ${constraints.content_type || 'general'}
- Doit afficher obligatoirement: ${JSON.stringify(constraints.must_show || [])}
${actionsStr}

CONTEXTE UTILISATEUR:
- Écran: ${context.screen?.viewportWidth || 1920}x${context.screen?.viewportHeight || 1080}, DPR ${context.screen?.dpr || 1}, ${context.device?.type || 'desktop'}
- Thème: ${context.prefs?.theme || 'dark'}
- Langue: ${context.prefs?.lang || 'fr'}
- Accessibilité: contraste=${context.a11y?.contrast || 'normal'}, mouvement réduit=${context.a11y?.reducedMotion || false}, lecteur d'écran=${context.a11y?.screenReader || false}
- Réseau: ${context.network?.type || 'wifi'}
- GPU: ${context.device?.gpu ? 'oui' : 'non'}, Cores: ${context.device?.cores || 8}, RAM: ${context.device?.ram || 8}GB

Génère le HTML optimal maintenant. RÈGLES ABSOLUES: CSS inline dans <style>, AUCUN JavaScript (ni <script> ni on*), SVG inline pour images, AUCUNE ressource externe.`;
  }
}
