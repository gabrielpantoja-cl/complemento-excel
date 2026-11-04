/**
 * Model fallback chain.
 *
 * Free and metered endpoints run out mid-session: OpenRouter's free tier is
 * capped per day (and per minute), and paid keys hit 402 when credits are
 * gone. When that happens the run ends with a trailing assistant error and
 * the turn is lost unless the user notices and re-sends by hand.
 *
 * This module mirrors `src/compaction/overflow-recovery.ts`: detect the
 * trailing failure, drop it, switch to the next model, and `agent.continue()`
 * once. The difference is the *budget* — overflow recovery retries once,
 * while a quota failure can legitimately cascade down a chain of models
 * (daily cap on one free model does not imply the next one is exhausted).
 * Each model in the chain is still tried at most once per prompt, so the loop
 * is bounded by the chain length and cannot spin.
 */

import type { Agent, AgentState } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";

/** Settings key holding the user's ordered chain. */
export const MODEL_FALLBACK_CHAIN_SETTING_KEY = "model.fallback.chain.v1";
/** Settings key holding the on/off switch. */
export const MODEL_FALLBACK_ENABLED_SETTING_KEY = "model.fallback.enabled.v1";

/** A model identified across provider boundaries. */
export interface ModelRef {
  provider: string;
  id: string;
}

export interface ModelFallbackStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

/**
 * Default chain for the free-tier setup: the strong multimodal model first,
 * then the fast small one (different daily buckets are not guaranteed, but a
 * different model often clears a per-model capacity error), then Gemma on a
 * different host entirely so a single provider outage cannot exhaust the
 * chain.
 */
export const DEFAULT_FREE_FALLBACK_CHAIN: readonly ModelRef[] = Object.freeze([
  { provider: "OpenRouter Free", id: "nvidia/nemotron-3.5-super-vl:free" },
  { provider: "OpenRouter Free", id: "nvidia/nemotron-3.5-lightning:free" },
  { provider: "OpenRouter Free", id: "google/gemma-4-31b-it:free" },
]);

/**
 * Error signatures that mean "this model will not answer right now, but
 * another one might".
 *
 * Deliberately narrow: a malformed request, an auth failure, or a tool error
 * must NOT trigger a model switch, because every model in the chain would
 * fail the same way and the user would just watch the chain burn down.
 */
const QUOTA_ERROR_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(?:402|429)\b/,
  /rate[\s_-]?limit/i,
  /too many requests/i,
  /quota/i,
  /insufficient (?:credits|balance|funds|quota)/i,
  /daily limit/i,
  /out of credits/i,
  /temporarily (?:rate[\s-]?limited|unavailable)/i,
  /no (?:endpoints|instances) available/i,
  /capacity/i,
  /overloaded/i,
  /\b50[23]\b/,
]);

/** Signatures that must never be treated as a quota failure. */
const NON_QUOTA_ERROR_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b401\b/,
  /\b403\b/,
  /invalid api key/i,
  /unauthorized/i,
  /authentication/i,
  /abort/i,
  /cancel/i,
]);

/**
 * True when the error text indicates an exhausted quota, a rate limit, or a
 * transient capacity problem on the provider side.
 */
export function isQuotaExhaustedError(message: string | null | undefined): boolean {
  if (typeof message !== "string") return false;
  const text = message.trim();
  if (text.length === 0) return false;

  if (NON_QUOTA_ERROR_PATTERNS.some((re) => re.test(text))) return false;
  return QUOTA_ERROR_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns the trailing assistant error message when it is a quota/capacity
 * failure produced by the session's *current* model, or null.
 *
 * The provider/model guard matters: after a switch, a stale error from the
 * previous model must not trigger another switch.
 */
export function findTrailingQuotaError(
  state: Pick<AgentState, "messages" | "model">,
): AssistantMessage | null {
  const messages = state.messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  if (last.stopReason !== "error") return null;

  const model = state.model;
  if (model && (last.provider !== model.provider || last.model !== model.id)) {
    return null;
  }

  return isQuotaExhaustedError(last.errorMessage ?? null) ? last : null;
}

/** Normalizes an unknown settings value into a chain. */
export function normalizeFallbackChain(value: unknown): ModelRef[] {
  if (!Array.isArray(value)) return [];

  const out: ModelRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { provider, id } = entry as Partial<ModelRef>;
    if (typeof provider !== "string" || typeof id !== "string") continue;

    const trimmedProvider = provider.trim();
    const trimmedId = id.trim();
    if (trimmedProvider.length === 0 || trimmedId.length === 0) continue;

    const key = `${trimmedProvider}\u0000${trimmedId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider: trimmedProvider, id: trimmedId });
  }

  return out;
}

export async function getStoredFallbackChain(store: ModelFallbackStore): Promise<ModelRef[]> {
  const stored = normalizeFallbackChain(await store.get(MODEL_FALLBACK_CHAIN_SETTING_KEY));
  return stored.length > 0 ? stored : [...DEFAULT_FREE_FALLBACK_CHAIN];
}

export async function setStoredFallbackChain(
  store: ModelFallbackStore,
  chain: readonly ModelRef[],
): Promise<ModelRef[]> {
  const normalized = normalizeFallbackChain(chain);
  await store.set(MODEL_FALLBACK_CHAIN_SETTING_KEY, normalized);
  return normalized;
}

export async function isFallbackEnabled(store: ModelFallbackStore): Promise<boolean> {
  const value = await store.get(MODEL_FALLBACK_ENABLED_SETTING_KEY);
  return value !== false;
}

export async function setFallbackEnabled(
  store: ModelFallbackStore,
  enabled: boolean,
): Promise<boolean> {
  await store.set(MODEL_FALLBACK_ENABLED_SETTING_KEY, enabled);
  return enabled;
}

/**
 * Picks the next usable model from the chain.
 *
 * Skips the current model and anything already attempted this prompt, and
 * skips refs that cannot be resolved to a real model (a chain entry can
 * outlive the provider it names — e.g. after the user logs out of it).
 */
export function selectNextFallbackModel(args: {
  chain: readonly ModelRef[];
  current: Pick<Model<Api>, "provider" | "id"> | null | undefined;
  attempted: ReadonlySet<string>;
  resolveModel: (ref: ModelRef) => Model<Api> | null;
}): Model<Api> | null {
  const { chain, current, attempted, resolveModel } = args;

  for (const ref of chain) {
    if (current && ref.provider === current.provider && ref.id === current.id) continue;
    if (attempted.has(modelRefKey(ref))) continue;

    const model = resolveModel(ref);
    if (model) return model;
  }

  return null;
}

export function modelRefKey(ref: Pick<ModelRef, "provider" | "id">): string {
  return `${ref.provider}\u0000${ref.id}`;
}

/**
 * Chain editing primitives.
 *
 * Pure and total: an out-of-range index or a duplicate entry returns the
 * chain unchanged rather than throwing, so the settings UI can call them
 * without guarding every click.
 */
export function moveChainEntry(
  chain: readonly ModelRef[],
  index: number,
  delta: number,
): ModelRef[] {
  const next = [...chain];
  const target = index + delta;
  if (index < 0 || index >= next.length) return next;
  if (target < 0 || target >= next.length) return next;

  const [entry] = next.splice(index, 1);
  if (!entry) return [...chain];
  next.splice(target, 0, entry);
  return next;
}

export function removeChainEntry(chain: readonly ModelRef[], index: number): ModelRef[] {
  if (index < 0 || index >= chain.length) return [...chain];
  return chain.filter((_, i) => i !== index);
}

/** Appends a model, ignoring one already in the chain. */
export function addChainEntry(chain: readonly ModelRef[], ref: ModelRef): ModelRef[] {
  const key = modelRefKey(ref);
  if (chain.some((entry) => modelRefKey(entry) === key)) return [...chain];
  return [...chain, { provider: ref.provider, id: ref.id }];
}

export interface FallbackRecoveryResult {
  /** Whether a switch happened and the turn was retried. */
  switched: boolean;
  /** The model the session ended up on, when a switch happened. */
  model?: Model<Api>;
  /** Why no switch happened, for logging/telemetry. */
  reason?: "no-quota-error" | "chain-exhausted" | "bad-tail";
}

/**
 * Quota-failure recovery: drop the failed assistant message, switch to the
 * next model in the chain, and continue the turn.
 *
 * Call once after a prompt run settles — it walks the chain internally, so
 * the caller must not loop. Returns `switched: false` when the failure was
 * not a quota failure, or when every model in the chain has been tried.
 */
export async function recoverByModelFallback(args: {
  agent: Agent;
  chain: readonly ModelRef[];
  resolveModel: (ref: ModelRef) => Model<Api> | null;
  /** Notifies the UI of each switch (toast, transcript note…). */
  onSwitch?: (model: Model<Api>, failed: Pick<ModelRef, "provider" | "id">) => void;
}): Promise<FallbackRecoveryResult> {
  const { agent, chain, resolveModel, onSwitch } = args;

  const attempted = new Set<string>();
  let result: FallbackRecoveryResult = { switched: false, reason: "no-quota-error" };

  // Bounded by the chain length: every iteration marks one more model as
  // attempted, and `selectNextFallbackModel` never returns an attempted one.
  for (let i = 0; i <= chain.length; i += 1) {
    const failure = findTrailingQuotaError(agent.state);
    if (!failure) return result;

    const current = agent.state.model;
    if (current) attempted.add(modelRefKey({ provider: current.provider, id: current.id }));

    const next = selectNextFallbackModel({ chain, current, attempted, resolveModel });
    if (!next) {
      return result.switched ? result : { switched: false, reason: "chain-exhausted" };
    }

    // Drop the failed assistant message so the retry context is clean.
    agent.state.messages = agent.state.messages.slice(0, -1);

    const tail = agent.state.messages[agent.state.messages.length - 1];
    if (!tail || tail.role === "assistant") {
      // Continuations require a non-assistant tail. Restore the failure so it
      // stays visible and persisted.
      agent.state.messages = [...agent.state.messages, failure];
      return result.switched ? result : { switched: false, reason: "bad-tail" };
    }

    attempted.add(modelRefKey({ provider: next.provider, id: next.id }));
    agent.state.model = next;
    onSwitch?.(next, { provider: failure.provider, id: failure.model });

    result = { switched: true, model: next };
    await agent.continue();
  }

  return result;
}
