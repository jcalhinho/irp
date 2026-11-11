// cache.js — Cache local des rendus IRP (IndexedDB)

const DB_NAME = 'irp-cache';
const DB_VERSION = 1;
const STORE_NAME = 'renders';

class IRPCache {
  constructor() {
    this._db = null;
  }

  /** Ouvre (ou crée) la base IndexedDB */
  async _openDB() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Génère une clé de cache à partir de l'IRP + contexte.
   * On ne cache que les éléments pertinents du contexte (pas le timestamp).
   */
  _makeKey(irp, context) {
    // irp peut être un string (path) ou un objet IRP
    const intent = typeof irp === 'string' ? irp : irp?.intent;
    const dataId = typeof irp === 'string' ? null : (irp?.data?.id || null);
    const ctx = context || {};
    const prefs = ctx.prefs || {};
    const device = ctx.device || {};
    const screen = ctx.screen || {};
    const a11y = ctx.a11y || {};

    const cacheKey = {
      intent,
      data_id: dataId,
      theme: prefs.theme || 'dark',
      lang: prefs.lang || 'fr',
      device_type: device.type || 'desktop',
      viewport: `${screen.viewportWidth || 0}x${screen.viewportHeight || 0}`,
      contrast: a11y.contrast || 'normal',
      reduced_motion: a11y.reducedMotion || false,
      font_size: a11y.fontSize || 'normal',
    };
    return JSON.stringify(cacheKey);
  }

  /**
   * Récupère un rendu en cache.
   * @returns {string|null} Le HTML caché ou null
   */
  async get(irp, context) {
    try {
      const db = await this._openDB();
      const key = this._makeKey(irp, context);

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result;
          if (result && result.expiresAt > Date.now()) {
            resolve(result.html);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('[IRP Cache] Erreur lecture:', e);
      return null;
    }
  }

  /**
   * Stocke un rendu en cache.
   * @param {string|Object} irp — Le path (string) ou l'IRP rendu (objet)
   * @param {Object} context — Le contexte utilisé
   * @param {Object} value — { html, renderer }
   * @param {number} ttl — Durée de vie en secondes (0 = pas de cache)
   */
  async set(irp, context, value, ttl = 3600) {
    if (ttl <= 0) return;

    try {
      const db = await this._openDB();
      const key = this._makeKey(irp, context);

      const intent = typeof irp === 'string' ? irp : irp?.intent;

      const entry = {
        key,
        html: value.html,
        renderer: value.renderer,
        intent,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
      };

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
    } catch (e) {
      console.warn('[IRP Cache] Erreur écriture:', e);
    }
  }

  /** Vide tout le cache */
  async clear() {
    try {
      const db = await this._openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch (e) {
      console.warn('[IRP Cache] Erreur clear:', e);
    }
  }

  /** Liste les entrées en cache (debug) */
  async list() {
    try {
      const db = await this._openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const items = req.result.map(e => ({
            intent: e.intent,
            createdAt: new Date(e.createdAt).toISOString(),
            expiresAt: new Date(e.expiresAt).toISOString(),
            size: e.html.length,
          }));
          resolve(items);
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }
}

export const irpCache = new IRPCache();
