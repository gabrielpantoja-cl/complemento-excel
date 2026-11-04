/**
 * OpenRouter free-tier quota probe.
 *
 * `GET /api/v1/key` reports how many free-model requests the account has left
 * in the current UTC day (`free_model_daily_requests`). The limit is
 * account-wide — 50/day under 10 lifetime credits purchased, 1,000/day at or
 * above — so a session can die mid-tasación with no warning. The status bar
 * surfaces the remaining count to make that visible before it happens.
 *
 * The endpoint allows browser CORS (verified against the add-in's Vercel
 * origin), so no local proxy is needed.
 */

export const OPENROUTER_KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";

/** How long a successful probe is reused before refetching. */
export const QUOTA_CACHE_TTL_MS = 60_000;
/** Back-off after a failed probe, so a dead network is not hammered. */
export const QUOTA_ERROR_BACKOFF_MS = 300_000;

export interface OpenRouterQuota {
  /** Free-model requests used in the current UTC day. */
  used: number;
  /** Free-model requests allowed per UTC day. */
  limit: number;
  /** Free-model requests left in the current UTC day. */
  remaining: number;
  /** Credit balance left, when the account has a spend limit set. */
  creditsRemaining: number | null;
  /** Whether the key is on the free tier. */
  isFreeTier: boolean;
  /** When this snapshot was taken (epoch ms). */
  fetchedAt: number;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parses the `/api/v1/key` payload.
 *
 * Returns null when the free-model block is absent — some accounts (BYOK,
 * enterprise) are exempt from free-model limits, and showing "0 left" there
 * would be worse than showing nothing.
 */
export function parseOpenRouterQuota(payload: unknown, now: number): OpenRouterQuota | null {
  if (typeof payload !== "object" || payload === null) return null;

  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;
  const free = record.free_model_daily_requests;
  if (typeof free !== "object" || free === null) return null;

  const freeRecord = free as Record<string, unknown>;
  const used = toFiniteNumber(freeRecord.used);
  const limit = toFiniteNumber(freeRecord.limit);
  const remainingRaw = toFiniteNumber(freeRecord.remaining);

  if (used === null || limit === null) return null;

  const remaining = remainingRaw ?? Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    creditsRemaining: toFiniteNumber(record.limit_remaining),
    isFreeTier: record.is_free_tier === true,
    fetchedAt: now,
  };
}

/** Fraction of the daily allowance already consumed, 0..1. */
export function quotaUsedFraction(quota: Pick<OpenRouterQuota, "used" | "limit">): number {
  if (quota.limit <= 0) return 0;
  return Math.min(1, Math.max(0, quota.used / quota.limit));
}

export type QuotaSeverity = "ok" | "warn" | "critical";

/**
 * Severity for the status-bar chip.
 *
 * Thresholds are on the *remaining* count rather than the percentage: with a
 * 1,000/day allowance, "8% left" is still 80 requests, but with 50/day it is
 * four. A tasación turn can easily burn several requests, so the absolute
 * count is what the user actually needs to act on.
 */
export function quotaSeverity(quota: Pick<OpenRouterQuota, "remaining" | "limit">): QuotaSeverity {
  if (quota.remaining <= 5) return "critical";
  if (quota.remaining <= 25) return "warn";
  return "ok";
}

interface CacheEntry {
  quota: OpenRouterQuota | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<OpenRouterQuota | null>>();

/** Cache key that never stores the key itself beyond this module's memory. */
function cacheKey(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

export function clearOpenRouterQuotaCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Last successful (or cached) snapshot, without triggering a fetch. */
export function peekOpenRouterQuota(apiKey: string): OpenRouterQuota | null {
  if (!apiKey) return null;
  return cache.get(cacheKey(apiKey))?.quota ?? null;
}

/**
 * Fetches the quota, reusing a cached snapshot within the TTL and collapsing
 * concurrent calls. Never throws: a failed probe yields null and backs off.
 */
export async function fetchOpenRouterQuota(
  apiKey: string,
  opts: {
    now?: number;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<OpenRouterQuota | null> {
  if (!apiKey || apiKey.trim().length === 0) return null;

  const now = opts.now ?? Date.now();
  const key = cacheKey(apiKey);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.quota;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return null;

  const request = (async (): Promise<OpenRouterQuota | null> => {
    try {
      const response = await doFetch(OPENROUTER_KEY_ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: opts.signal,
      });

      if (!response.ok) {
        cache.set(key, { quota: null, expiresAt: now + QUOTA_ERROR_BACKOFF_MS });
        return null;
      }

      const quota = parseOpenRouterQuota(await response.json(), now);
      cache.set(key, {
        quota,
        expiresAt: now + (quota ? QUOTA_CACHE_TTL_MS : QUOTA_ERROR_BACKOFF_MS),
      });
      return quota;
    } catch {
      cache.set(key, { quota: null, expiresAt: now + QUOTA_ERROR_BACKOFF_MS });
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
