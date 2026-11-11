// context-sensor.js — Détecte le contexte utilisateur pour le rendu IRP

export class ContextSensor {
  /**
   * Détecte tout le contexte utilisateur en un seul appel.
   * @returns {Promise<Object>} Objet contexte complet
   */
  async detect() {
    return {
      screen: this.getScreen(),
      a11y: this.getA11y(),
      prefs: this.getPrefs(),
      device: this.getDevice(),
      network: this.getNetwork(),
      battery: await this.getBattery(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Dimensions et densité d'écran */
  getScreen() {
    return {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      dpr: window.devicePixelRatio || 1,
      orientation: window.screen.orientation?.type || 'unknown',
      colorDepth: window.screen.colorDepth || 24,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  /** Préférences d'accessibilité */
  getA11y() {
    const mq = (query) => window.matchMedia(query).matches;
    return {
      contrast: mq('(prefers-contrast: more)') ? 'high'
              : mq('(prefers-contrast: less)') ? 'low' : 'normal',
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),
      forcedColors: mq('(forced-colors: active)'),
      screenReader: this._detectScreenReader(),
      fontSize: this._detectFontSize(),
    };
  }

  /** Préférences utilisateur (thème, langue) */
  getPrefs() {
    const mq = (query) => window.matchMedia(query).matches;
    return {
      theme: mq('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      lang: navigator.language || 'en',
      languages: navigator.languages || [navigator.language || 'en'],
      direction: document.dir || (this._isRTL(navigator.language) ? 'rtl' : 'ltr'),
    };
  }

  /** Type d'appareil et capacités */
  getDevice() {
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const isTablet = /iPad|Tablet/i.test(ua);
    return {
      type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
      platform: navigator.platform || 'unknown',
      cores: navigator.hardwareConcurrency || 1,
      ram: navigator.deviceMemory || null, // GB, approximatif
      gpu: this._hasWebGPU(),
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      online: navigator.onLine,
    };
  }

  /** Type de connexion réseau */
  getNetwork() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return { type: 'unknown', downlink: null, rtt: null };
    return {
      type: conn.effectiveType || 'unknown',
      downlink: conn.downlink || null,   // Mbps
      rtt: conn.rtt || null,             // ms
      saveData: conn.saveData || false,
    };
  }

  /** Niveau de batterie */
  async getBattery() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        return {
          level: battery.level,
          charging: battery.charging,
        };
      }
    } catch (e) {
      // getBattery peut ne pas être disponible
    }
    return { level: null, charging: null };
  }

  // ─── Helpers privés ──────────────────────────────────────

  _detectScreenReader() {
    // Détection heuristique : pas fiable à 100% mais utile
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && 'ontouchstart' in window === false;
  }

  _detectFontSize() {
    // Estime la taille de police par défaut en comparant rem à px
    const el = document.createElement('div');
    el.style.cssText = 'font-size:1rem;display:none;';
    document.body.appendChild(el);
    const size = parseFloat(getComputedStyle(el).fontSize);
    document.body.removeChild(el);
    if (size >= 20) return 'large';
    if (size >= 17) return 'medium';
    return 'normal';
  }

  _hasWebGPU() {
    return 'gpu' in navigator;
  }

  _isRTL(lang) {
    const rtlLangs = ['ar', 'he', 'fa', 'ur', 'yi'];
    return rtlLangs.some(l => lang?.startsWith(l));
  }
}
