const STORAGE_PREFIX = 'slayql_cache_v4:';
// localStorage so the workspace opens instantly after a refresh, in a new tab or after a restart.
const store = () => window.localStorage;
const memoryCache = new Map();
const inFlight = new Map();

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStoredEntry(key) {
  try {
    const raw = store().getItem(storageKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeStoredEntry(key) {
  try {
    store().removeItem(storageKey(key));
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
    store().setItem(storageKey(key), JSON.stringify(entry));
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
    for (let index = store().length - 1; index >= 0; index -= 1) {
      const key = store().key(index) || '';
      if (key === storageKey(prefix) || key.startsWith(`${storageKey(prefix)}:`)) {
        store().removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function clearClientCache() {
  memoryCache.clear();
  try {
    for (let index = store().length - 1; index >= 0; index -= 1) {
      const key = store().key(index) || '';
      if (key.startsWith(STORAGE_PREFIX)) store().removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

// Stale-while-revalidate: a fresh entry is returned as is; an expired one is returned at once
// while a background request refreshes it for next time, so the UI never waits for data it has
// already seen. Only a first-ever request (or `force`) waits for the network.
export async function cachedRequest(key, request, ttlMs, { force = false } = {}) {
  const refresh = () => {
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = Promise.resolve()
      .then(request)
      .then((value) => setClientCache(key, value))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
  if (!force) {
    const entry = memoryCache.get(key) || readStoredEntry(key);
    if (entry) {
      memoryCache.set(key, entry);
      if (Date.now() - entry.createdAt > ttlMs) refresh().catch(() => {});
      return entry.value;
    }
  }
  return refresh();
}
