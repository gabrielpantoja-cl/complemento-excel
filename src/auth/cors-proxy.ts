/**
 * Fetch interceptor for dev + production.
 *
 * Dev:
 * - rewrites external URLs to Vite's local reverse proxies (/api-proxy/*, /oauth-proxy/*)
 *
 * Production:
 * - does NOT assume any local reverse proxy exists
 * - optionally routes *OAuth/token* endpoints through a user-configured CORS proxy
 *   (<proxy>/?url=<target>) so browser OAuth flows work in Office webviews.
 */

import { getAppStorage } from "@earendil-works/pi-web-ui/dist/storage/app-storage.js";

import {
  DEFAULT_LOCAL_PROXY_URL,
  validateOfficeProxyUrl,
} from "./proxy-validation.js";
import { rewriteDevProxyUrl } from "./dev-rewrites.js";

/** The original, un-patched fetch — use for requests that should bypass the proxy */
export let originalFetch: typeof window.fetch;

type ProxySettingsCache = {
  checkedAt: number;
  enabled: boolean;
  url?: string;
};

const proxyCache: ProxySettingsCache = {
  checkedAt: 0,
  enabled: false,
  url: undefined,
};

async function getEnabledProxyUrl(): Promise<string | undefined> {
  // OAuth flows are infrequent, but fetch() is frequent; cache for a short time.
  const now = Date.now();
  if (now - proxyCache.checkedAt < 3000) {
    return proxyCache.enabled ? proxyCache.url : undefined;
  }

  proxyCache.checkedAt = now;

  let enabled: unknown;
  let url: unknown;

  try {
    const storage = getAppStorage();
    enabled = await storage.settings.get("proxy.enabled");
    url = await storage.settings.get("proxy.url");
  } catch {
    proxyCache.enabled = false;
    proxyCache.url = undefined;
    return undefined;
  }

  proxyCache.enabled = Boolean(enabled);
  if (!proxyCache.enabled) {
    proxyCache.url = undefined;
    return undefined;
  }

  const trimmed = typeof url === "string" ? url.trim() : "";
  const candidateUrl = trimmed.length > 0 ? trimmed : DEFAULT_LOCAL_PROXY_URL;

  // Guardrails: validate proxy URL (and fail fast for mixed-content HTTP proxies).
  // This may throw and should surface to the caller.
  const validated = validateOfficeProxyUrl(candidateUrl);
  proxyCache.url = validated;
  return validated;
}

function looksLikeOAuthOrTokenEndpoint(url: string): boolean {
  // Proxy only endpoints that are known to be blocked by CORS in browsers.
  // Keep this conservative so normal fetch() calls aren't routed unexpectedly.
  try {
    const u = new URL(url);

    // Anthropic OAuth token exchange / refresh
    if (
      (u.hostname === "console.anthropic.com" || u.hostname === "platform.claude.com") &&
      u.pathname.startsWith("/v1/oauth/token")
    ) {
      return true;
    }

    // GitHub device flow + token exchange (supports enterprise domains too)
    if (u.pathname === "/login/device/code") return true;
    if (u.pathname === "/login/oauth/access_token") return true;

    // GitHub Copilot token endpoint (github.com or GHE)
    if (u.pathname.includes("/copilot_internal/")) return true;

    // OpenAI auth endpoints (not all are browser-friendly)
    if (u.hostname === "auth.openai.com" && u.pathname.startsWith("/oauth/")) return true;

    // Google OAuth token endpoint
    if (u.hostname === "oauth2.googleapis.com") return true;

    // Google Cloud Code Assist onboarding/auth-adjacent endpoints
    if (u.hostname === "cloudcode-pa.googleapis.com" && u.pathname.startsWith("/v1internal")) return true;
    if (u.hostname === "daily-cloudcode-pa.sandbox.googleapis.com" && u.pathname.startsWith("/v1internal")) return true;

    return false;
  } catch {
    return false;
  }
}

function stripAnthropicBrowserHeader(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) return init;
  const headers = new Headers(init.headers);
  headers.delete("anthropic-dangerous-direct-browser-access");
  return { ...init, headers };
}

/**
 * HTTP request-header prefixes that the OpenAI SDK (Stainless-generated
 * client) injects as telemetry. Many upstreams (MiniMax, Z.AI's
 * Anthropic-compat, etc.) do NOT whitelist these in `Access-Control-Allow-
 * Headers`, so the browser blocks the preflighted POST. Stripping them
 * makes the request look like a plain browser fetch.
 *
 * Exported for unit tests; not part of the public API.
 */
export const STRIPPED_REQUEST_HEADER_PREFIXES: readonly string[] = [
  "x-stainless-", // OpenAI SDK (Stainless) telemetry
];

function isStrippedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return STRIPPED_REQUEST_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Remove browser-CORS-blocking telemetry headers from a `RequestInit`.
 *
 * Handles every shape `fetch()` accepts:
 *  - `Headers` instance (mutated in place)
 *  - `Record<string, string>` (replaced with a filtered clone)
 *  - `[string, string][]` header tuples (replaced with a filtered copy)
 *  - `undefined` (returned as-is)
 *
 * Returns the (possibly mutated) original `RequestInit` to keep the
 * call site a one-liner; do not treat the return value as a fresh
 * RequestInit when no filtering happened.
 */
export function stripTelemetryHeaders(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) return init;

  if (init.headers instanceof Headers) {
    let mutated = false;
    for (const key of [...init.headers.keys()]) {
      if (isStrippedHeader(key)) {
        init.headers.delete(key);
        mutated = true;
      }
    }
    // Headers are mutated in place; return the same RequestInit reference.
    if (mutated) return init;
    return init;
  }

  if (Array.isArray(init.headers)) {
    const filtered = init.headers.filter(([name]) => !isStrippedHeader(name));
    if (filtered.length !== init.headers.length) {
      init = { ...init, headers: filtered };
    }
    return init;
  }

  // Plain object form.
  let mutated = false;
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(init.headers)) {
    if (isStrippedHeader(name)) {
      mutated = true;
      continue;
    }
    filtered[name] = value;
  }
  if (mutated) init = { ...init, headers: filtered };
  return init;
}

/**
 * Install the fetch interceptor. Call once at boot.
 */
export function installFetchInterceptor(): void {
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    // Relative URLs: never rewrite
    if (!/^https?:\/\//i.test(url)) {
      return originalFetch(input, init);
    }

    // Strip SDK telemetry headers BEFORE any other branch. The OpenAI
    // SDK (Stainless) injects `x-stainless-*` headers into every request,
    // and many upstreams (e.g. api.minimax.io) do not whitelist them in
    // `Access-Control-Allow-Headers`, so Chromium blocks the preflighted
    // POST with "Request header field x-stainless-os is not allowed...".
    // The interceptor handles this once, so neither the OpenAI SDK nor
    // any future adapter needs to know about it.
    const cleanedInit = stripTelemetryHeaders(init);

    // Dev: Vite reverse proxies
    if (import.meta.env.DEV) {
      const rewritten = rewriteDevProxyUrl(url);
      if (!rewritten) return originalFetch(input, cleanedInit);

      const newInit = stripAnthropicBrowserHeader(cleanedInit);

      if (typeof input !== "string" && !(input instanceof URL) && input instanceof Request) {
        const newHeaders = new Headers(input.headers);
        newHeaders.delete("anthropic-dangerous-direct-browser-access");
        input = new Request(rewritten, { ...input, headers: newHeaders });
      } else {
        input = rewritten;
      }

      return originalFetch(input, newInit);
    }

    // Production: proxy OAuth/token endpoints through user-configured CORS proxy.
    if (looksLikeOAuthOrTokenEndpoint(url)) {
      const proxyUrl = await getEnabledProxyUrl();
      if (proxyUrl) {
        const proxied = `${proxyUrl}/?url=${encodeURIComponent(url)}`;
        return originalFetch(proxied, stripAnthropicBrowserHeader(cleanedInit));
      }
    }

    return originalFetch(input, cleanedInit);
  };
}
