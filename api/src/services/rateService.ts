import fetch from 'node-fetch';

interface RateCache {
  USD?: number;
  EUR?: number;
  fetchedAt?: number;
}

const cache: RateCache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getRate(currency: 'USD' | 'EUR'): Promise<{ rate: number; source: 'nbp' }> {
  const now = Date.now();
  if (cache[currency] && cache.fetchedAt && now - cache.fetchedAt < CACHE_TTL) {
    return { rate: cache[currency]!, source: 'nbp' };
  }

  const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`NBP fetch failed for ${currency}: ${res.status}`);
  }

  const data = await res.json() as { rates: Array<{ mid: number }> };
  const rate = data.rates[0].mid;
  cache[currency] = rate;
  cache.fetchedAt = now;
  return { rate, source: 'nbp' };
}

// Manual overrides (in-memory, session-scoped)
const manualRates: Record<string, number> = {};

export function setManualRate(currency: string, rate: number) {
  manualRates[currency.toUpperCase()] = rate;
}

export function getManualRate(currency: string): number | undefined {
  return manualRates[currency.toUpperCase()];
}
