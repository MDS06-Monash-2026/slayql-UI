const STORAGE_PREFIX = 'slayql_cache_v2:';
const memoryCache = new Map();
const inFlight = new Map();

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStoredEntry(key) {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeStoredEntry(key) {
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function getClientCache(key, ttlMs) {
  const entry = memoryCache.get(key) || readStoredEntry(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > ttlMs) {
    memoryCache.delete(key);
    removeStoredEntry(key);
    return undefined;
  }
  memoryCache.set(key, entry);
  return entry.value;
}

export function setClientCache(key, value) {
  const entry = { createdAt: Date.now(), value };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Keep the in-memory layer even when session storage is full or blocked.
  }
  return value;
}

export function invalidateClientCache(prefix) {
  for (const key of memoryCache.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) memoryCache.delete(key);
  }
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index) || '';
      if (key === storageKey(prefix) || key.startsWith(`${storageKey(prefix)}:`)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function clearClientCache() {
  memoryCache.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index) || '';
      if (key.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export async function cachedRequest(key, request, ttlMs, { force = false } = {}) {
  if (!force) {
    const cached = getClientCache(key, ttlMs);
    if (cached !== undefined) return cached;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = Promise.resolve()
    .then(request)
    .then((value) => setClientCache(key, value))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
