// Simple in-memory cache with 5-minute TTL
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheItem<unknown>>();

export function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return item.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(key: string): void {
  cache.delete(key);
}

// Cache keys
export const CACHE_KEYS = {
  TEAMS: 'teams',
  MATCHES: 'matches',
  TOURNAMENT_SETTINGS: 'tournament_settings',
} as const;
