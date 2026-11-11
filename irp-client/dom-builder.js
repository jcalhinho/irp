// dom-builder.js — Construit et injecte le DOM généré par l'IA
// Version 3: HTML assaini par liste blanche (sanitizer.js), AUCUN script exécuté

import './sanitizer.js'; // définit globalThis.IRPSanitizer

export class DomBuilder {
  constructor(rootId = 'irp-root') {
    this.root = document.getElementById(rootId);
    if (!this.root) {
      // Auto-création du root si manquant
      this.root = document.createElement('div');
      this.root.id = rootId;
      document.body.appendChild(this.root);
    }
    this._transitionDuration = 300;
  }

  /**
   * Remplace immédiatement le contenu de la racine (sans transition).
   * Le HTML est assaini par liste blanche : aucun script n'est exécuté.
   * @param {string} html — Le HTML généré par l'IA (non fiable)
   */
  setHTML(html) {
    globalThis.IRPSanitizer.mount(this.root, html);
  }

  /**
   * Injecte du HTML dans la racine avec transition (fade out → remplace → fade in).
   * @param {string} html — Le HTML généré par l'IA (non fiable)
   */
  inject(html) {
    // On assainit AVANT la transition : le fragment est prêt, seul le remplacement est différé
    const fragment = globalThis.IRPSanitizer.sanitizeToFragment(html, document);

    this.root.style.transition = `opacity ${this._transitionDuration / 2}ms ease`;
    this.root.style.opacity = '0';

    setTimeout(() => {
      this.root.replaceChildren(fragment);

      // Forcer le reflow puis remettre l'opacité
      void this.root.offsetHeight;
      this.root.style.opacity = '1';
    }, this._transitionDuration / 2);
  }

  /**
   * Affiche l'état de chargement.
   * @param {string} message — Message à afficher
   * @param {number|null} progress — Pourcentage 0-100 (optionnel)
   */
  showLoading(message, progress = null) {
    let progressHtml = '';
    if (progress !== null) {
      progressHtml = `
        <div class="irp-progress">
          <div class="irp-progress__bar" style="width:${progress}%"></div>
          <span class="irp-progress__label">${progress}%</span>
        </div>`;
    }
    this.root.innerHTML = `
      <div class="irp-loading">
        <div class="irp-loading__icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#1e1e3a" stroke-width="3"/>
            <circle cx="24" cy="24" r="20" stroke="#4CAF50" stroke-width="3"
              stroke-dasharray="80 200" stroke-linecap="round" fill="none">
              <animateTransform attributeName="transform" type="rotate"
                from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
        <p class="irp-loading__text">${this._escape(message)}</p>
        ${progressHtml}
      </div>
    `;
  }

  /**
   * Affiche une erreur avec option de retry.
   * @param {string} title — Titre de l'erreur
   * @param {string} message — Message détaillé
   * @param {string|null} details — Détails techniques (optionnel)
   * @param {Function|null} retryFn — Fonction de retry (optionnel)
   */
  showError(title, message, details = null, retryFn = null) {
    let detailsHtml = '';
    if (details) {
      detailsHtml = `<details class="irp-error__details"><summary>Détails techniques</summary><pre>${this._escape(details)}</pre></details>`;
    }
    let retryHtml = '';
    if (retryFn) {
      retryHtml = `<button class="irp-error__retry" id="irp-retry-btn">↻ Réessayer</button>`;
    }
    this.root.innerHTML = `
      <div class="irp-error">
        <div class="irp-error__icon">⚠️</div>
        <h2>${this._escape(title)}</h2>
        <p>${this._escape(message)}</p>
        ${detailsHtml}
        ${retryHtml}
      </div>
    `;
    if (retryFn) {
      const btn = document.getElementById('irp-retry-btn');
      if (btn) btn.addEventListener('click', retryFn);
    }
  }

  // ─── Privé ──────────────────────────────────────────────

  _escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
