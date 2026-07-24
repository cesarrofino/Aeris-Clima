/* =========================================================================
   Aeris · storage.js
   Camada de acesso ao LocalStorage — definições, favoritos, recentes e cache.
   ========================================================================= */

const Storage = {
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* quota excedida ou modo privado — falha silenciosa */ }
  },

  getSettings() {
    return this._read(CONFIG.STORAGE_KEYS.settings, {
      unit: 'C',
      lang: 'pt',
      theme: 'auto',
      allowLocation: true,
      autoRefresh: true,
      lowData: false,
      dailyTips: true,
    });
  },
  setSettings(settings) {
    this._write(CONFIG.STORAGE_KEYS.settings, settings);
  },

  getFavorites() {
    return this._read(CONFIG.STORAGE_KEYS.favorites, []);
  },
  setFavorites(list) {
    this._write(CONFIG.STORAGE_KEYS.favorites, list);
  },
  isFavorite(lat, lon) {
    return this.getFavorites().some(f => this._sameCoords(f, lat, lon));
  },
  toggleFavorite(city) {
    const list = this.getFavorites();
    const idx = list.findIndex(f => this._sameCoords(f, city.lat, city.lon));
    if (idx >= 0) {
      list.splice(idx, 1);
      this.setFavorites(list);
      return false;
    }
    list.push(city);
    this.setFavorites(list);
    return true;
  },
  removeFavorite(lat, lon) {
    const list = this.getFavorites().filter(f => !this._sameCoords(f, lat, lon));
    this.setFavorites(list);
  },
  _sameCoords(f, lat, lon) {
    return Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01;
  },

  getRecents() {
    return this._read(CONFIG.STORAGE_KEYS.recents, []);
  },
  addRecent(city) {
    let list = this.getRecents().filter(c => !this._sameCoords(c, city.lat, city.lon));
    list.unshift(city);
    list = list.slice(0, 8);
    this._write(CONFIG.STORAGE_KEYS.recents, list);
  },

  getLastLocation() {
    return this._read(CONFIG.STORAGE_KEYS.lastLocation, null);
  },
  setLastLocation(city) {
    this._write(CONFIG.STORAGE_KEYS.lastLocation, city);
  },

  getLastScreen() {
    return this._read(CONFIG.STORAGE_KEYS.lastScreen, 'home');
  },
  setLastScreen(screen) {
    this._write(CONFIG.STORAGE_KEYS.lastScreen, screen);
  },

  getCache(key, ttlMs) {
    const cache = this._read(CONFIG.STORAGE_KEYS.cache, {});
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > (ttlMs || CONFIG.CACHE_TTL_MS)) return null;
    return entry.data;
  },
  setCache(key, data) {
    const cache = this._read(CONFIG.STORAGE_KEYS.cache, {});
    cache[key] = { ts: Date.now(), data };
    this._write(CONFIG.STORAGE_KEYS.cache, cache);
  },
  // Modo offline mais forte: ignora o TTL normal e devolve os dados
  // guardados mesmo que estejam "expirados", desde que não sejam mais
  // antigos que STALE_CACHE_MAX_AGE_MS. Usado apenas quando um pedido à
  // rede falha (sem ligação), como último recurso antes de mostrar erro.
  getCacheStale(key) {
    const cache = this._read(CONFIG.STORAGE_KEYS.cache, {});
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CONFIG.STALE_CACHE_MAX_AGE_MS) return null;
    return entry; // { ts, data }
  },
  clearCache() {
    this._write(CONFIG.STORAGE_KEYS.cache, {});
  }
};
