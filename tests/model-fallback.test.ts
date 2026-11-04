import assert from "node:assert/strict";
import { test } from "node:test";

import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, Usage } from "@earendil-works/pi-ai";

import {
  DEFAULT_FREE_FALLBACK_CHAIN,
  addChainEntry,
  findTrailingQuotaError,
  getStoredFallbackChain,
  isFallbackEnabled,
  isQuotaExhaustedError,
  modelRefKey,
  moveChainEntry,
  normalizeFallbackChain,
  removeChainEntry,
  recoverByModelFallback,
  selectNextFallbackModel,
  setFallbackEnabled,
  setStoredFallbackChain,
  type ModelRef,
} from "../src/models/fallback-chain.ts";

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

// Real shape of an OpenRouter free-tier daily cap rejection.
const OPENROUTER_DAILY_CAP_ERROR =
  "429 Provider returned error: Rate limit exceeded: free-models-per-day. "
  + "Add 10 credits to unlock 1000 free model requests per day.";

const OPENROUTER_CREDITS_ERROR =
  "402 This request requires more credits, or fewer max_tokens. "
  + "You requested up to 65536 tokens, but can only afford 1200.";

function createModel(id: string, provider = "OpenRouter Free"): Model<Api> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider,
    baseUrl: "https://openrouter.ai/api/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  };
}

function createUser(text: string, timestamp: number): AgentMessage {
  return { role: "user", content: text, timestamp };
}

function createError(model: Model<Api>, errorMessage: string, timestamp: number): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason: "error",
    errorMessage,
    timestamp,
  };
}

/**
 * Agent whose `continue()` can be scripted to fail again, so a cascading
 * walk down the chain is observable.
 */
function createTestAgent(args: {
  model: Model<Api>;
  messages: AgentMessage[];
  /** Error to append on each continue(), by call index. null = success. */
  continueOutcomes?: (string | null)[];
}): Agent & { continueCalls: number; modelsUsed: string[] } {
  const outcomes = args.continueOutcomes ?? [];

  class RecordingAgent extends Agent {
    continueCalls = 0;
    modelsUsed: string[] = [];

    override continue(): Promise<void> {
      const index = this.continueCalls;
      this.continueCalls += 1;

      const current = this.state.model as Model<Api>;
      this.modelsUsed.push(current.id);

      const outcome = outcomes[index];
      if (outcome) {
        this.state.messages = [
          ...this.state.messages,
          createError(current, outcome, 100 + index),
        ];
      }
      return Promise.resolve();
    }
  }

  return new RecordingAgent({
    initialState: { model: args.model, messages: args.messages, tools: [] },
  });
}

class MemoryStore {
  private readonly values = new Map<string, unknown>();

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

void test("isQuotaExhaustedError matches real quota, rate-limit and capacity failures", () => {
  assert.equal(isQuotaExhaustedError(OPENROUTER_DAILY_CAP_ERROR), true);
  assert.equal(isQuotaExhaustedError(OPENROUTER_CREDITS_ERROR), true);
  assert.equal(isQuotaExhaustedError("429 Too Many Requests"), true);
  assert.equal(isQuotaExhaustedError("Insufficient credits"), true);
  assert.equal(isQuotaExhaustedError("503 no instances available"), true);
  assert.equal(isQuotaExhaustedError("Model is overloaded, please retry"), true);
});

void test("isQuotaExhaustedError rejects failures another model would also hit", () => {
  // Auth and request-shape errors must not burn the chain.
  assert.equal(isQuotaExhaustedError("401 Unauthorized: invalid API key"), false);
  assert.equal(isQuotaExhaustedError("403 Forbidden"), false);
  assert.equal(isQuotaExhaustedError("400 Bad Request: tool schema invalid"), false);
  assert.equal(isQuotaExhaustedError("The operation was aborted"), false);
  assert.equal(isQuotaExhaustedError(""), false);
  assert.equal(isQuotaExhaustedError(null), false);
  assert.equal(isQuotaExhaustedError(undefined), false);
});

void test("findTrailingQuotaError matches a cap failure from the active model", () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const failure = createError(model, OPENROUTER_DAILY_CAP_ERROR, 2);

  const found = findTrailingQuotaError({
    messages: [createUser("revisa el cuadro de referenciales", 1), failure],
    model,
  });

  assert.equal(found, failure);
});

void test("findTrailingQuotaError ignores a stale failure from a previous model", () => {
  const oldModel = createModel("nvidia/nemotron-3.5-super-vl:free");
  const newModel = createModel("google/gemma-4-31b-it:free");

  const found = findTrailingQuotaError({
    messages: [createUser("hola", 1), createError(oldModel, OPENROUTER_DAILY_CAP_ERROR, 2)],
    model: newModel,
  });

  assert.equal(found, null);
});

void test("findTrailingQuotaError ignores non-quota errors", () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");

  const found = findTrailingQuotaError({
    messages: [createUser("hola", 1), createError(model, "401 Unauthorized", 2)],
    model,
  });

  assert.equal(found, null);
});

void test("selectNextFallbackModel skips the current model and unresolvable refs", () => {
  const current = createModel("nvidia/nemotron-3.5-super-vl:free");
  const resolvable = createModel("google/gemma-4-31b-it:free");

  const chain: ModelRef[] = [
    { provider: "OpenRouter Free", id: "nvidia/nemotron-3.5-super-vl:free" },
    { provider: "Removed Provider", id: "ghost-model" },
    { provider: "OpenRouter Free", id: "google/gemma-4-31b-it:free" },
  ];

  const next = selectNextFallbackModel({
    chain,
    current,
    attempted: new Set([modelRefKey(current)]),
    resolveModel: (ref) => (ref.id === "google/gemma-4-31b-it:free" ? resolvable : null),
  });

  assert.equal(next?.id, "google/gemma-4-31b-it:free");
});

void test("selectNextFallbackModel returns null once every model was attempted", () => {
  const current = createModel("a:free");

  const next = selectNextFallbackModel({
    chain: [
      { provider: "OpenRouter Free", id: "a:free" },
      { provider: "OpenRouter Free", id: "b:free" },
    ],
    current,
    attempted: new Set([
      modelRefKey({ provider: "OpenRouter Free", id: "a:free" }),
      modelRefKey({ provider: "OpenRouter Free", id: "b:free" }),
    ]),
    resolveModel: (ref) => createModel(ref.id),
  });

  assert.equal(next, null);
});

void test("recoverByModelFallback switches model, drops the failure, and retries once", async () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const failure = createError(model, OPENROUTER_DAILY_CAP_ERROR, 2);
  const agent = createTestAgent({
    model,
    messages: [createUser("vincula el cuadro", 1), failure],
  });

  const switches: string[] = [];
  const result = await recoverByModelFallback({
    agent,
    chain: DEFAULT_FREE_FALLBACK_CHAIN,
    resolveModel: (ref) => createModel(ref.id),
    onSwitch: (next) => switches.push(next.id),
  });

  assert.equal(result.switched, true);
  assert.equal(agent.continueCalls, 1);
  assert.equal(agent.state.model.id, "nvidia/nemotron-3.5-lightning:free");
  assert.deepEqual(switches, ["nvidia/nemotron-3.5-lightning:free"]);
  // The failed assistant message is gone from the retry context.
  assert.equal(agent.state.messages.length, 1);
  assert.equal(agent.state.messages[0]?.role, "user");
});

void test("recoverByModelFallback cascades down the chain when the next model is capped too", async () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const agent = createTestAgent({
    model,
    messages: [createUser("hola", 1), createError(model, OPENROUTER_DAILY_CAP_ERROR, 2)],
    // First retry fails with a cap as well; second succeeds.
    continueOutcomes: [OPENROUTER_DAILY_CAP_ERROR, null],
  });

  const result = await recoverByModelFallback({
    agent,
    chain: DEFAULT_FREE_FALLBACK_CHAIN,
    resolveModel: (ref) => createModel(ref.id),
  });

  assert.equal(result.switched, true);
  assert.equal(agent.continueCalls, 2);
  assert.deepEqual(agent.modelsUsed, [
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-31b-it:free",
  ]);
  assert.equal(agent.state.model.id, "google/gemma-4-31b-it:free");
});

void test("recoverByModelFallback stops when the whole chain is exhausted", async () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const agent = createTestAgent({
    model,
    messages: [createUser("hola", 1), createError(model, OPENROUTER_DAILY_CAP_ERROR, 2)],
    // Every retry fails: the chain must terminate, not spin.
    continueOutcomes: [
      OPENROUTER_DAILY_CAP_ERROR,
      OPENROUTER_DAILY_CAP_ERROR,
      OPENROUTER_DAILY_CAP_ERROR,
      OPENROUTER_DAILY_CAP_ERROR,
    ],
  });

  const result = await recoverByModelFallback({
    agent,
    chain: DEFAULT_FREE_FALLBACK_CHAIN,
    resolveModel: (ref) => createModel(ref.id),
  });

  assert.equal(result.switched, true);
  // 3-model chain, current model is the first entry: at most 2 switches.
  assert.equal(agent.continueCalls, 2);
  // The final failure stays in the transcript for the error banner.
  const last = agent.state.messages[agent.state.messages.length - 1];
  assert.equal(last?.role, "assistant");
});

void test("recoverByModelFallback does nothing for a non-quota failure", async () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const failure = createError(model, "401 Unauthorized: invalid API key", 2);
  const agent = createTestAgent({ model, messages: [createUser("hola", 1), failure] });

  const result = await recoverByModelFallback({
    agent,
    chain: DEFAULT_FREE_FALLBACK_CHAIN,
    resolveModel: (ref) => createModel(ref.id),
  });

  assert.equal(result.switched, false);
  assert.equal(result.reason, "no-quota-error");
  assert.equal(agent.continueCalls, 0);
  assert.equal(agent.state.messages.length, 2);
});

void test("recoverByModelFallback restores the failure when the tail cannot be continued", async () => {
  const model = createModel("nvidia/nemotron-3.5-super-vl:free");
  const failure = createError(model, OPENROUTER_DAILY_CAP_ERROR, 2);
  // Assistant-only history: dropping the failure leaves an assistant tail.
  const earlier = createError(model, "", 1);
  earlier.stopReason = "stop";

  const agent = createTestAgent({ model, messages: [earlier, failure] });

  const result = await recoverByModelFallback({
    agent,
    chain: DEFAULT_FREE_FALLBACK_CHAIN,
    resolveModel: (ref) => createModel(ref.id),
  });

  assert.equal(result.switched, false);
  assert.equal(result.reason, "bad-tail");
  assert.equal(agent.continueCalls, 0);
  assert.equal(agent.state.messages.length, 2);
  assert.equal(agent.state.messages[1], failure);
});

void test("normalizeFallbackChain drops malformed entries and duplicates", () => {
  const chain = normalizeFallbackChain([
    { provider: "OpenRouter Free", id: "a:free" },
    { provider: "OpenRouter Free", id: "a:free" },
    { provider: "  ", id: "b:free" },
    { provider: "OpenRouter Free", id: "" },
    "nope",
    null,
    { provider: "OpenRouter Free", id: " b:free " },
  ]);

  assert.deepEqual(chain, [
    { provider: "OpenRouter Free", id: "a:free" },
    { provider: "OpenRouter Free", id: "b:free" },
  ]);
});

void test("chain persistence falls back to the free default and round-trips", async () => {
  const store = new MemoryStore();

  assert.deepEqual(await getStoredFallbackChain(store), [...DEFAULT_FREE_FALLBACK_CHAIN]);

  const custom: ModelRef[] = [
    { provider: "OpenRouter Free", id: "google/gemma-4-31b-it:free" },
    { provider: "OpenAI", id: "gpt-6-luna" },
  ];
  await setStoredFallbackChain(store, custom);

  assert.deepEqual(await getStoredFallbackChain(store), custom);
});

void test("fallback is enabled by default and can be turned off", async () => {
  const store = new MemoryStore();

  assert.equal(await isFallbackEnabled(store), true);

  await setFallbackEnabled(store, false);
  assert.equal(await isFallbackEnabled(store), false);

  await setFallbackEnabled(store, true);
  assert.equal(await isFallbackEnabled(store), true);
});

// ── Chain editing (settings UI) ───────────────────────────────────────────

const EDIT_CHAIN: ModelRef[] = [
  { provider: "OpenRouter Free", id: "a:free" },
  { provider: "OpenRouter Free", id: "b:free" },
  { provider: "OpenRouter Free", id: "c:free" },
];

void test("moveChainEntry reorders without mutating the input", () => {
  const moved = moveChainEntry(EDIT_CHAIN, 2, -1);

  assert.deepEqual(moved.map((m) => m.id), ["a:free", "c:free", "b:free"]);
  assert.deepEqual(EDIT_CHAIN.map((m) => m.id), ["a:free", "b:free", "c:free"]);
});

void test("moveChainEntry is a no-op at the edges and out of range", () => {
  assert.deepEqual(moveChainEntry(EDIT_CHAIN, 0, -1), EDIT_CHAIN);
  assert.deepEqual(moveChainEntry(EDIT_CHAIN, 2, 1), EDIT_CHAIN);
  assert.deepEqual(moveChainEntry(EDIT_CHAIN, 9, -1), EDIT_CHAIN);
  assert.deepEqual(moveChainEntry(EDIT_CHAIN, -1, 1), EDIT_CHAIN);
});

void test("removeChainEntry drops one entry and ignores bad indices", () => {
  assert.deepEqual(removeChainEntry(EDIT_CHAIN, 1).map((m) => m.id), ["a:free", "c:free"]);
  assert.deepEqual(removeChainEntry(EDIT_CHAIN, 9), EDIT_CHAIN);
  assert.deepEqual(removeChainEntry([], 0), []);
});

void test("addChainEntry appends and refuses duplicates", () => {
  const added = addChainEntry(EDIT_CHAIN, { provider: "OpenAI", id: "gpt-6-luna" });
  assert.equal(added.length, 4);
  assert.equal(added[3]?.id, "gpt-6-luna");

  // Same provider + id: no duplicate.
  assert.deepEqual(addChainEntry(EDIT_CHAIN, { provider: "OpenRouter Free", id: "b:free" }), EDIT_CHAIN);
  // Same id on another provider is a different model.
  assert.equal(addChainEntry(EDIT_CHAIN, { provider: "Other", id: "b:free" }).length, 4);
});

void test("an emptied chain falls back to the free default on read", async () => {
  const store = new MemoryStore();
  await setStoredFallbackChain(store, []);

  // Removing every entry must not silently disable the feature with no trace;
  // the toggle is the documented way to turn it off.
  assert.deepEqual(await getStoredFallbackChain(store), [...DEFAULT_FREE_FALLBACK_CHAIN]);
});
