import { getCached, setCached } from './cache.js';
import fetchWithRetry from './fetchWithRetry.js';
import apiHealth from './apiHealth.js';
import config from '../config.js';

const GW2_ITEMS_ENDPOINT = `${config.API_BASE_URL}/items?ids=`;
const LANG_PARAM = `&lang=${config.LANG}`;
const MAX_BATCH = 200;
const FLUSH_MS = 50;

const queue = new Set();
const pending = new Map();
let timer = null;
let controller = null;

function buildHeaders(ids) {
  if (ids.length !== 1) return {};
  const cached = getCached(`item_${ids[0]}`, true);
  if (!cached) return {};
  const headers = {};
  if (cached.etag) headers['If-None-Match'] = cached.etag;
  if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
  return headers;
}

// Precarga en memoria los items cacheados recientemente
function preloadCache() {
  if (typeof localStorage === 'undefined') return;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('item_')) getCached(key);
  }
}
preloadCache();

function scheduleFlush() {
  if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
  }
  if (queue.size >= MAX_BATCH) {
    clearTimeout(timer);
    flush();
  }
}

async function flush() {
  if (queue.size === 0) {
    timer = null;
    return;
  }
  timer = null;
  const ids = Array.from(queue).slice(0, MAX_BATCH);
  ids.forEach(id => queue.delete(id));
  try {
    const extraDelay = apiHealth.getBackoff();
    if (extraDelay) await new Promise(res => setTimeout(res, extraDelay));
    controller = new AbortController();
    const res = await fetchWithRetry(GW2_ITEMS_ENDPOINT + ids.join(',') + LANG_PARAM, {
      headers: buildHeaders(ids),
      signal: controller.signal,
      backoff: 300 + extraDelay
    });
    if (res.status === 304) {
      ids.forEach(id => {
        const entry = pending.get(id);
        const cached = getCached(`item_${id}`);
        if (entry) entry.resolve(cached);
        pending.delete(id);
      });
      return;
    }
    const etag = res.headers.get('ETag');
    const lastModified = res.headers.get('Last-Modified');
    const data = await res.json();
    const dataMap = new Map(data.map(item => [item.id, item]));
    ids.forEach(id => {
      const entry = pending.get(id);
      const item = dataMap.get(id);
      if (item) {
        setCached(`item_${id}`, item, undefined, { etag, lastModified });
        entry.resolve(item);
      } else {
        entry.resolve(null);
      }
      pending.delete(id);
    });
  } catch (err) {
    ids.forEach(id => {
      const entry = pending.get(id);
      if (entry) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          entry.reject(err);
        } else {
          entry.reject(err);
        }
      }
      pending.delete(id);
    });
  }
  if (queue.size > 0) {
    scheduleFlush();
  }
}

export function requestItems(ids = [], signal) {
  if (controller) {
    controller.abort();
    controller = null;
  }
  if (signal) {
    signal.addEventListener('abort', () => controller && controller.abort(), { once: true });
  }
  const promises = ids.map(id => {
    const cached = getCached(`item_${id}`);
    if (cached) return Promise.resolve(cached);
    if (pending.has(id)) return pending.get(id).promise;
    const entry = {};
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    pending.set(id, entry);
    queue.add(id);
    scheduleFlush();
    return entry.promise;
  });
  return Promise.all(promises);
}

export function abortRequests() {
  if (controller) {
    controller.abort();
    controller = null;
  }
  queue.clear();
  pending.forEach(entry => entry.reject(new DOMException('Aborted', 'AbortError')));
  pending.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
