type CacheEntry<T> = {
  data?: T;
  updatedAt?: number;
  inFlight?: Promise<T>;
};

const queryCache = new Map<string, CacheEntry<unknown>>();

function getOrCreateEntry<T>(key: string): CacheEntry<T> {
  const existing = queryCache.get(key) as CacheEntry<T> | undefined;
  if (existing) {
    return existing;
  }

  const created: CacheEntry<T> = {};
  queryCache.set(key, created as CacheEntry<unknown>);
  return created;
}

export function readQueryCache<T>(key: string): T | undefined {
  const entry = queryCache.get(key) as CacheEntry<T> | undefined;
  return entry?.data;
}

export function readFreshQueryCache<T>(key: string, staleMs: number): T | undefined {
  const entry = queryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry?.data || !entry.updatedAt) {
    return undefined;
  }

  if (Date.now() - entry.updatedAt > staleMs) {
    return undefined;
  }

  return entry.data;
}

export async function fetchWithQueryCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean },
): Promise<T> {
  const entry = getOrCreateEntry<T>(key);

  if (!options?.force) {
    if (entry.inFlight) {
      return entry.inFlight;
    }
  }

  const inFlight = fetcher()
    .then((data) => {
      entry.data = data;
      entry.updatedAt = Date.now();
      return data;
    })
    .finally(() => {
      if (entry.inFlight === inFlight) {
        entry.inFlight = undefined;
      }
    });

  entry.inFlight = inFlight;
  return inFlight;
}

export function clearQueryCache(key?: string): void {
  if (key) {
    queryCache.delete(key);
    return;
  }

  queryCache.clear();
}
