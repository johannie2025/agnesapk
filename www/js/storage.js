const K = { key: 'agnes_api_key', url: 'agnes_base_url', theme: 'agnes_theme' };

// URL de base officielle de l'Agnes Open API.
export const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com';

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const storage = {
  getKey: () => safe(() => localStorage.getItem(K.key) || '', ''),
  setKey: (v) => safe(() => localStorage.setItem(K.key, v)),
  clearKey: () => safe(() => localStorage.removeItem(K.key)),
  getBaseUrl: () => safe(() => localStorage.getItem(K.url) || DEFAULT_BASE_URL, DEFAULT_BASE_URL),
  setBaseUrl: (v) => safe(() => localStorage.setItem(K.url, v)),
  getTheme: () => safe(() => localStorage.getItem(K.theme) || 'dark', 'dark'),
  setTheme: (v) => safe(() => localStorage.setItem(K.theme, v)),
};
