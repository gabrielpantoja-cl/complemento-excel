import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPENROUTER_KEY_ENDPOINT,
  QUOTA_ERROR_BACKOFF_MS,
  clearOpenRouterQuotaCache,
  fetchOpenRouterQuota,
  parseOpenRouterQuota,
  peekOpenRouterQuota,
  quotaSeverity,
  quotaUsedFraction,
} from "../src/auth/openrouter-quota.ts";

import {
  isFreeTierModelId,
  isOpenRouterProviderName,
} from "../src/taskpane/quota-indicator.ts";

/** Minimal stand-in for the parts of `Response` the probe touches. */
interface FakeResponse {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

// Real response shape of GET https://openrouter.ai/api/v1/key.
function keyPayload(used: number, limit: number, remaining?: number): unknown {
  return {
    data: {
      label: "sk-or-v1-...abc",
      limit: null,
      limit_remaining: 4.21,
      is_free_tier: false,
      usage: 5.79,
      usage_daily: 0.12,
      free_model_daily_requests: {
        used,
        limit,
        remaining: remaining ?? limit - used,
      },
    },
  };
}

void test("parseOpenRouterQuota reads the free-model daily block", () => {
  const quota = parseOpenRouterQuota(keyPayload(140, 1000), 1_700_000_000_000);

  assert.ok(quota);
  assert.equal(quota.used, 140);
  assert.equal(quota.limit, 1000);
  assert.equal(quota.remaining, 860);
  assert.equal(quota.creditsRemaining, 4.21);
  assert.equal(quota.isFreeTier, false);
  assert.equal(quota.fetchedAt, 1_700_000_000_000);
});

void test("parseOpenRouterQuota derives remaining when the field is absent", () => {
  const quota = parseOpenRouterQuota(
    { data: { free_model_daily_requests: { used: 30, limit: 50 } } },
    1,
  );

  assert.equal(quota?.remaining, 20);
});

void test("parseOpenRouterQuota returns null for exempt or malformed payloads", () => {
  // BYOK/enterprise accounts have no free-model block — showing "0 left"
  // there would be worse than showing nothing.
  assert.equal(parseOpenRouterQuota({ data: { usage: 1 } }, 1), null);
  assert.equal(parseOpenRouterQuota({ data: null }, 1), null);
  assert.equal(parseOpenRouterQuota({}, 1), null);
  assert.equal(parseOpenRouterQuota(null, 1), null);
  assert.equal(parseOpenRouterQuota("nope", 1), null);
  assert.equal(
    parseOpenRouterQuota({ data: { free_model_daily_requests: { used: "x", limit: 50 } } }, 1),
    null,
  );
});

void test("quotaUsedFraction is clamped to 0..1", () => {
  assert.equal(quotaUsedFraction({ used: 500, limit: 1000 }), 0.5);
  assert.equal(quotaUsedFraction({ used: 1200, limit: 1000 }), 1);
  assert.equal(quotaUsedFraction({ used: 0, limit: 0 }), 0);
});

void test("quotaSeverity escalates on the absolute count, not the percentage", () => {
  // 8% left of 1000 is 80 requests — still plenty of tasación turns.
  assert.equal(quotaSeverity({ remaining: 80, limit: 1000 }), "ok");
  assert.equal(quotaSeverity({ remaining: 25, limit: 1000 }), "warn");
  assert.equal(quotaSeverity({ remaining: 5, limit: 1000 }), "critical");
  assert.equal(quotaSeverity({ remaining: 0, limit: 50 }), "critical");
  // Small allowance: 8% left of 50 is 4 requests.
  assert.equal(quotaSeverity({ remaining: 4, limit: 50 }), "critical");
});

void test("fetchOpenRouterQuota sends a bearer token and caches the snapshot", async () => {
  clearOpenRouterQuotaCache();

  let calls = 0;
  let seenUrl = "";
  let seenAuth: string | null = null;

  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls += 1;
    seenUrl = url;
    seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    const response: FakeResponse = {
      ok: true,
      json: () => Promise.resolve(keyPayload(10, 1000)),
    };
    return Promise.resolve(response);
  }) as unknown as typeof fetch;

  const first = await fetchOpenRouterQuota("sk-or-v1-secret", { fetchImpl, now: 1000 });
  const second = await fetchOpenRouterQuota("sk-or-v1-secret", { fetchImpl, now: 2000 });

  assert.equal(seenUrl, OPENROUTER_KEY_ENDPOINT);
  assert.equal(seenAuth, "Bearer sk-or-v1-secret");
  assert.equal(calls, 1, "the second call within the TTL must be served from cache");
  assert.equal(first?.remaining, 990);
  assert.equal(second?.remaining, 990);
  assert.equal(peekOpenRouterQuota("sk-or-v1-secret")?.remaining, 990);
});

void test("fetchOpenRouterQuota refetches once the TTL expires", async () => {
  clearOpenRouterQuotaCache();

  let calls = 0;
  const fetchImpl = (() => {
    calls += 1;
    const response: FakeResponse = {
      ok: true,
      json: () => Promise.resolve(keyPayload(calls * 10, 1000)),
    };
    return Promise.resolve(response);
  }) as unknown as typeof fetch;

  await fetchOpenRouterQuota("key-a", { fetchImpl, now: 0 });
  const later = await fetchOpenRouterQuota("key-a", { fetchImpl, now: 120_000 });

  assert.equal(calls, 2);
  assert.equal(later?.used, 20);
});

void test("fetchOpenRouterQuota never throws and backs off after a failure", async () => {
  clearOpenRouterQuotaCache();

  let calls = 0;
  const failing = (() => {
    calls += 1;
    return Promise.reject(new Error("network down"));
  }) as unknown as typeof fetch;

  assert.equal(await fetchOpenRouterQuota("key-b", { fetchImpl: failing, now: 0 }), null);
  // Inside the back-off window: no second request.
  assert.equal(await fetchOpenRouterQuota("key-b", { fetchImpl: failing, now: 1000 }), null);
  assert.equal(calls, 1);

  // After the back-off window it tries again.
  await fetchOpenRouterQuota("key-b", { fetchImpl: failing, now: QUOTA_ERROR_BACKOFF_MS + 1 });
  assert.equal(calls, 2);
});

void test("fetchOpenRouterQuota treats a non-OK response as unknown", async () => {
  clearOpenRouterQuotaCache();

  const notFound: FakeResponse = { ok: false, status: 401, json: () => Promise.resolve({}) };
  const fetchImpl = (() => Promise.resolve(notFound)) as unknown as typeof fetch;

  assert.equal(await fetchOpenRouterQuota("key-c", { fetchImpl, now: 0 }), null);
});

void test("fetchOpenRouterQuota ignores an empty key", async () => {
  clearOpenRouterQuotaCache();

  let calls = 0;
  const fetchImpl = (() => {
    calls += 1;
    const response: FakeResponse = { ok: true, json: () => Promise.resolve({}) };
    return Promise.resolve(response);
  }) as unknown as typeof fetch;

  assert.equal(await fetchOpenRouterQuota("", { fetchImpl }), null);
  assert.equal(await fetchOpenRouterQuota("   ", { fetchImpl }), null);
  assert.equal(calls, 0);
});

void test("the quota chip only applies to OpenRouter free-tier models", () => {
  assert.equal(isOpenRouterProviderName("OpenRouter Free"), true);
  assert.equal(isOpenRouterProviderName("openrouter"), true);
  assert.equal(isOpenRouterProviderName("MiniMax"), false);
  assert.equal(isOpenRouterProviderName(null), false);

  assert.equal(isFreeTierModelId("nvidia/nemotron-3.5-super-vl:free"), true);
  // Paid ids are not metered by the free daily allowance.
  assert.equal(isFreeTierModelId("openai/gpt-6-luna"), false);
  assert.equal(isFreeTierModelId(undefined), false);
});
