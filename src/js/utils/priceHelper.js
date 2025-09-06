import config from '../config.js';

const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isSessionStrategy() {
  return (config?.priceCacheStrategy || 'sessionStorage') === 'sessionStorage';
}

function storageKey(id) {
  return `price_${id}`;
}

function loadFromSession(id) {
  if (!isSessionStrategy() || typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(storageKey(id));
  if (!raw) return null;
  try {
    const { value, expires } = JSON.parse(raw);
    if (expires && Date.now() > expires) {
      sessionStorage.removeItem(storageKey(id));
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(storageKey(id));
    return null;
  }
}

function saveToSession(id, value) {
  if (!isSessionStrategy() || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      storageKey(id),
      JSON.stringify({ value, expires: Date.now() + CACHE_TTL })
    );
  } catch {
    // ignore storage errors
  }
}

async function fetchPrices(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return new Map();
  if ((config?.priceCacheStrategy || 'sessionStorage') === 'redis') {
    const url = `/backend/api/itemBundle.php?ids=${ids.join(',')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Price fetch failed');
    const arr = await resp.json();
    const out = new Map();
    arr.forEach(entry => {
      const m = entry.market || {};
      out.set(entry.id, { buy_price: m.buy_price || 0, sell_price: m.sell_price || 0 });
    });
    return out;
  } else {
    const fields = ['id', 'buy_price', 'sell_price'].join(',');
    const url = `https://api.datawars2.ie/gw2/v1/items/csv?fields=${fields}&ids=${ids.join(',')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Price fetch failed');
    const text = await resp.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    const out = new Map();
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const values = lines[i].split(',');
      const obj = {};
      headers.forEach((h, idx) => {
        const v = values[idx];
        obj[h] = v !== undefined ? (isNaN(v) ? v : Number(v)) : null;
      });
      if (obj.id != null) {
        out.set(obj.id, { buy_price: obj.buy_price || 0, sell_price: obj.sell_price || 0 });
      }
    }
    return out;
  }
}

export async function preloadPrices(ids = []) {
  const result = new Map();
  const toFetch = [];
  ids.forEach(id => {
    id = Number(id);
    if (memoryCache.has(id)) {
      result.set(id, memoryCache.get(id));
      return;
    }
    const stored = loadFromSession(id);
    if (stored) {
      memoryCache.set(id, stored);
      result.set(id, stored);
    } else {
      toFetch.push(id);
    }
  });
  if (toFetch.length) {
    try {
      const fetched = await fetchPrices(toFetch);
      fetched.forEach((data, id) => {
        memoryCache.set(id, data);
        saveToSession(id, data);
        result.set(id, data);
      });
    } catch (e) {
      console.error('Error preloading prices', e);
    }
  }
  ids.forEach(id => {
    id = Number(id);
    if (!result.has(id) && memoryCache.has(id)) result.set(id, memoryCache.get(id));
    if (!result.has(id)) result.set(id, { buy_price: 0, sell_price: 0 });
  });
  return result;
}

export async function getPrice(id) {
  id = Number(id);
  if (memoryCache.has(id)) return memoryCache.get(id);
  const stored = loadFromSession(id);
  if (stored) {
    memoryCache.set(id, stored);
    return stored;
  }
  const map = await preloadPrices([id]);
  return map.get(id);
}

export function clearCache() {
  memoryCache.clear();
  if (isSessionStrategy() && typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('price_')) {
        sessionStorage.removeItem(key);
      }
    }
  }
}
