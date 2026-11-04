/**
 * Free-tier quota indicator wiring.
 *
 * Owns the polling loop behind the status bar's quota chip: the bar renders
 * synchronously from agent state, so it can only read an already-fetched
 * snapshot (`peekOpenRouterQuota`). This module keeps that snapshot fresh.
 *
 * Polling is deliberately lazy — it only runs while the active model belongs
 * to a metered free provider, and it stops when the taskpane is hidden, so a
 * backgrounded sidebar does not burn requests or battery.
 */

import {
  fetchOpenRouterQuota,
  peekOpenRouterQuota,
  QUOTA_CACHE_TTL_MS,
  type OpenRouterQuota,
} from "../auth/openrouter-quota.js";
import { setStatusQuotaProvider } from "./status-bar.js";

/**
 * Providers whose models are metered by OpenRouter's free-model daily cap.
 *
 * Matched against `model.provider`, which for preset providers is the
 * preset's `providerName` (see `src/auth/provider-presets.ts`).
 */
const OPENROUTER_PROVIDER_NAMES: ReadonlySet<string> = new Set([
  "OpenRouter Free",
  "openrouter",
]);

export function isOpenRouterProviderName(provider: string | null | undefined): boolean {
  if (typeof provider !== "string") return false;
  return OPENROUTER_PROVIDER_NAMES.has(provider) || provider.toLowerCase().startsWith("openrouter");
}

/** Only `:free` models draw from the free-model daily allowance. */
export function isFreeTierModelId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.endsWith(":free");
}

export interface QuotaIndicatorHandle {
  /** Forces a refresh now (e.g. right after a quota error). */
  refresh: () => Promise<OpenRouterQuota | null>;
  dispose: () => void;
}

export function installQuotaIndicator(opts: {
  /** The active session's model, or null. */
  getActiveModel: () => { provider: string; id: string } | null;
  /** API key for the given provider name, when one is configured. */
  getApiKey: (provider: string) => string | undefined;
  /** Triggers a status-bar re-render after the snapshot changes. */
  requestRender: () => void;
  /** Poll interval. Defaults to the snapshot TTL. */
  intervalMs?: number;
}): QuotaIndicatorHandle {
  const { getActiveModel, getApiKey, requestRender } = opts;
  const intervalMs = opts.intervalMs ?? QUOTA_CACHE_TTL_MS;

  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSignature: string | null = null;

  const activeKey = (): string | undefined => {
    const model = getActiveModel();
    if (!model) return undefined;
    if (!isOpenRouterProviderName(model.provider)) return undefined;
    if (!isFreeTierModelId(model.id)) return undefined;
    return getApiKey(model.provider);
  };

  setStatusQuotaProvider((model) => {
    if (!model) return null;
    if (!isOpenRouterProviderName(model.provider)) return null;
    if (!isFreeTierModelId(model.id)) return null;

    const key = getApiKey(model.provider);
    return key ? peekOpenRouterQuota(key) : null;
  });

  const refresh = async (): Promise<OpenRouterQuota | null> => {
    if (disposed) return null;

    const key = activeKey();
    if (!key) return null;

    const quota = await fetchOpenRouterQuota(key);
    if (disposed) return null;

    const signature = quota ? `${quota.remaining}/${quota.limit}` : "none";
    if (signature !== lastSignature) {
      lastSignature = signature;
      requestRender();
    }

    return quota;
  };

  const tick = (): void => {
    if (document.visibilityState === "hidden") return;
    void refresh();
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") tick();
  };

  timer = setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);
  tick();

  return {
    refresh,
    dispose: () => {
      disposed = true;
      setStatusQuotaProvider(null);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
