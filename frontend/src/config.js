function normalize(value, fallback) {
  const base = String(value || '').trim();
  return base ? base.replace(/\/$/, '') : fallback;
}

// 同源 /api、/ws 走 Vite 代理；独立部署可用绝对地址覆盖。
export const API_BASE = normalize(import.meta.env.VITE_API_BASE, '/api');
export const WS_BASE = normalize(import.meta.env.VITE_WS_BASE, '');

export function apiUrl(path = '') {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith('/api/') ? path.slice(4) : path;
  return `${API_BASE}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

export function wsUrl(token) {
  const query = `?token=${encodeURIComponent(token)}`;
  if (WS_BASE) {
    return `${WS_BASE.replace(/\/$/, '')}/ws${query}`;
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws${query}`;
}
