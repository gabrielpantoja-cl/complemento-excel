/**
 * Preset provider registry.
 *
 * A preset provider is a managed custom gateway whose endpoint, default
 * model, and display name are baked into the add-in. End users only need
 * to pick the row and paste their API key — no manual endpoint URL typing.
 *
 * This mirrors the opencode pattern: each preset is a small object with
 * the metadata needed to render the login row, persist the credential,
 * route the API call, and select a default model.
 *
 * Each entry is also typed as `CustomProvider` underneath so the runtime
 * can store it via the existing `CustomProvidersStore` without schema
 * changes.
 *
 * `PRESET_PROVIDERS` is the single source of truth for which token-plan
 * vendors get a one-click login row. The UI in `src/ui/provider-login.ts`
 * pulls them via `getPresetProviderConfig()` and renders them at the top
 * of `ALL_PROVIDERS` (see the `preset` field on `ProviderDef`).
 *
 * The MiniMax preset is the default for this fork (Tasaciones by Loxos).
 * It is wired against `api.minimax.io` because that is the cluster that
 * authenticates the project's Token Plan Plus Subscription Keys (prefix
 * `sk-cp-...`). The routing choice (openai-completions vs
 * anthropic-messages) is non-obvious and was settled by live probes
 * (see commit `b11c297`): only the openai-completions endpoint at
 * `api.minimax.io` passes the browser's CORS preflight because its
 * `access-control-allow-headers` includes `Authorization` (the header
 * the openai SDK sends by default), while the anthropic-messages
 * endpoint at the same host does NOT include `x-api-key`.
 */

import type { Api } from "@earendil-works/pi-ai";
import type { CustomProvider } from "@earendil-works/pi-web-ui/dist/storage/stores/custom-providers-store.js";

/** Gateway protocols the preset framework knows how to wire. */
export type PresetGatewayKind = "openai-completions" | "anthropic-messages";

/**
 * One selectable model inside a preset provider.
 *
 * Context windows differ per model, so they cannot be inherited from the
 * preset: a 1M-context model and a 256K one must advertise their real limits
 * or auto-compaction thresholds will be wrong.
 */
export interface PresetModel {
  /** Model id as the gateway expects it (e.g. `nvidia/nemotron-3.5-lightning:free`). */
  id: string;
  /** Human label for the picker. Defaults to `id`. */
  name?: string;
  /** Context window in tokens. */
  contextWindow: number;
  /** Max output tokens. Capped at `contextWindow` when the record is built. */
  maxTokens: number;
  /** Input modalities. Defaults to `["text"]`. */
  input?: readonly ("text" | "image")[];
  /** Whether the model exposes reasoning/thinking output. Defaults to false. */
  reasoning?: boolean;
  /** Free endpoints cost nothing; paid presets can declare real costs. */
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Fields shared by every preset, regardless of gateway protocol. */
interface PresetCommonFields {
  /** Stable identifier used to (a) match the login row, (b) key the storage record. */
  id: string;
  /** UI label shown in the welcome/login row. */
  label: string;
  /** Optional subtitle / tagline shown under the label. */
  desc?: string;
  /** Optional keychain hint; defaults to "Enter API key". */
  apiKeyHint?: string;
  /** API base URL without a trailing slash. */
  baseUrl: string;
  /** Display name surfaced in the provider picker and `/settings` gateway list. */
  displayName: string;
  /** Internal provider name attached to model records (used by the model picker). */
  providerName: string;
  /** Default model id selected when this preset is the only provider. */
  modelId: string;
  /** Context window advertised to the agent (controls auto-compaction thresholds). */
  contextWindow: number;
  /** Default max output tokens (capped at contextWindow). */
  maxTokens: number;
  /**
   * Optional catalog of additional models exposed by this preset.
   *
   * Every entry becomes its own record in the `customProviders` store, so the
   * model picker lists them all under `providerName`. The model named by
   * `modelId` is always included (first), even when absent from this list.
   *
   * Keep the order stable: it is part of the model-picker ordering and of the
   * prompt-cache prefix (see "Prompt caching gotchas" in AGENTS.md).
   */
  models?: readonly PresetModel[];
}

/** Anthropic-Messages-specific knobs. */
interface AnthropicMessagesPresetFields {
  /**
   * `anthropic-version` header. Defaults to "2023-06-01" if unset.
   * Required by the Anthropic Messages API and most compatible clones.
   */
  anthropicVersion?: string;
  /**
   * Extra HTTP headers to inject into every request. Useful for clones that
   * reject the default headers or require a custom auth scheme (e.g.
   * `Authorization: Bearer <key>` instead of `x-api-key`).
   */
  extraHeaders?: Readonly<Record<string, string>>;
}

/**
 * Discriminated union: TypeScript narrows the extra fields based on `kind`,
 * so future providers cannot silently omit protocol-specific knobs at compile time.
 */
export type PresetProviderConfig =
  | (PresetCommonFields & { kind: "openai-completions" })
  | (PresetCommonFields & AnthropicMessagesPresetFields & { kind: "anthropic-messages" });

/**
 * Shipped preset list. Default ships with MiniMax (Token Plan Plus)
 * because that is the project's primary token plan. To add another
 * token-plan vendor, append a new entry here with a unique `id` and
 * reference it from a `ProviderDef` row in `src/ui/provider-login.ts`.
 */
export const PRESET_PROVIDERS: ReadonlyArray<PresetProviderConfig> = Object.freeze([
  Object.freeze({
    id: "minimax",
    label: "MiniMax (Token Plan Plus)",
    desc: "MiniMax-M3 (1M context) - plan Plus 20 USD/mes",
    apiKeyHint: "Subscription Key de MiniMax (eyJ...)",
    baseUrl: "https://api.minimax.io/v1",
    displayName: "MiniMax",
    providerName: "MiniMax",
    modelId: "MiniMax-M3",
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    models: Object.freeze([
      { id: "MiniMax-M3", contextWindow: 1_000_000, maxTokens: 131_072 },
      { id: "MiniMax-M2.7", contextWindow: 204_800, maxTokens: 131_072 },
      { id: "MiniMax-M2.7-highspeed", contextWindow: 204_800, maxTokens: 131_072 },
      { id: "MiniMax-M2.5", contextWindow: 204_800, maxTokens: 131_072 },
      { id: "MiniMax-M2.5-highspeed", contextWindow: 204_800, maxTokens: 131_072 },
    ]),
    kind: "openai-completions",
  }),

  // OpenRouter free tier.
  //
  // Why a preset instead of the built-in `openrouter` provider: the pinned
  // `@earendil-works/pi-ai` registry predates every model below, so none of
  // them can be selected through the built-in provider. The preset declares
  // the ids explicitly, which keeps the add-in's model catalog independent
  // from the upstream registry's release cadence.
  //
  // Model list verified against `GET https://openrouter.ai/api/v1/models` on
  // 2026-11-04: every entry is priced at 0/0, advertises `tools` in
  // `supported_parameters`, and reported >= 94% uptime over the previous day.
  // Re-verify before editing — OpenRouter rotates the free catalog often.
  //
  // Rate limits are account-wide, not per model: 20 requests/minute always,
  // plus 1,000 requests/day once >= 10 credits have been purchased all-time
  // (50/day below that). Deliberately excluded: `stealth/*` models, which are
  // free because the lab reads the prompts.
  Object.freeze({
    id: "openrouter-free",
    label: "OpenRouter (modelos gratis)",
    desc: "Nemotron 3.5 / Gemma 4 - 1.000 solicitudes al dia",
    apiKeyHint: "API key de OpenRouter (sk-or-v1-...)",
    baseUrl: "https://openrouter.ai/api/v1",
    displayName: "OpenRouter Free",
    providerName: "OpenRouter Free",
    modelId: "nvidia/nemotron-3.5-super-vl:free",
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    models: Object.freeze([
      {
        id: "nvidia/nemotron-3.5-super-vl:free",
        name: "Nemotron 3.5 Super VL (free)",
        contextWindow: 1_000_000,
        maxTokens: 131_072,
        input: Object.freeze(["text", "image"] as const),
        reasoning: true,
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        name: "Nemotron 3 Ultra (free)",
        contextWindow: 1_000_000,
        maxTokens: 65_536,
        reasoning: true,
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "Nemotron 3.5 Lightning (free)",
        contextWindow: 1_000_000,
        maxTokens: 65_536,
        reasoning: true,
      },
      {
        id: "cohere/north-mini-code:free",
        name: "North Mini Code (free)",
        contextWindow: 256_000,
        maxTokens: 64_000,
        reasoning: true,
      },
      {
        id: "google/gemma-4-31b-it:free",
        name: "Gemma 4 31B (free)",
        contextWindow: 262_144,
        maxTokens: 32_768,
        input: Object.freeze(["text", "image"] as const),
        reasoning: true,
      },
      {
        id: "google/gemma-4-26b-a4b-it:free",
        name: "Gemma 4 26B A4B (free)",
        contextWindow: 262_144,
        maxTokens: 32_768,
        input: Object.freeze(["text", "image"] as const),
        reasoning: true,
      },
    ]),
    kind: "openai-completions",
  }),
]);

/**
 * Stable id used inside the `customProviders` IndexedDB store.
 *
 * Prefixed so it cannot collide with user-defined `pi-openai-gateway:*` records.
 */
export function presetProviderStorageId(presetId: string): string {
  return `pi-preset:${presetId}`;
}

export function getPresetProviderConfig(presetId: string): PresetProviderConfig | null {
  return PRESET_PROVIDERS.find((p) => p.id === presetId) ?? null;
}

/** Storage shape of one model inside a `CustomProvider` record. */
type StoredPresetModel = NonNullable<CustomProvider["models"]>[number];

/**
 * Ordered, de-duplicated model list for a preset.
 *
 * `modelId` always comes first so it stays the preset's default, and the
 * order is otherwise the declaration order in `models` — both the model
 * picker and the prompt-cache prefix depend on it being deterministic.
 */
export function resolvePresetModels(preset: PresetProviderConfig): PresetModel[] {
  const declared = preset.models ?? [];
  const primary =
    declared.find((m) => m.id === preset.modelId)
    ?? {
      id: preset.modelId,
      contextWindow: preset.contextWindow,
      maxTokens: preset.maxTokens,
    };

  const out: PresetModel[] = [primary];
  const seen = new Set<string>([primary.id]);

  for (const model of declared) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }

  return out;
}

/**
 * Build a `CustomProvider` record (the storage shape) for the given preset.
 *
 * Every model from `resolvePresetModels()` is registered with
 * `provider: preset.providerName` and `baseUrl: preset.baseUrl`, so the model
 * picker lists them all under one login row. The `kind` decides the gateway
 * protocol and the `api` field on each embedded model — dispatch happens via
 * `model.api` in `pi-ai`'s api-registry.
 */
export function buildPresetProviderRecord(
  preset: PresetProviderConfig,
  apiKey: string,
): CustomProvider {
  const api: Api = preset.kind === "anthropic-messages" ? "anthropic-messages" : "openai-completions";

  const headers =
    preset.kind === "anthropic-messages"
      ? {
          "anthropic-version": preset.anthropicVersion ?? "2023-06-01",
          ...preset.extraHeaders,
        }
      : undefined;

  const models = resolvePresetModels(preset).map((model) => {
    const contextWindow = model.contextWindow;
    const record: StoredPresetModel = {
      id: model.id,
      name: model.name ?? model.id,
      provider: preset.providerName,
      api,
      baseUrl: preset.baseUrl,
      contextWindow,
      maxTokens: Math.min(model.maxTokens, contextWindow),
      input: [...(model.input ?? ["text"])],
      reasoning: model.reasoning ?? false,
      cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };

    if (headers) record.headers = headers;
    return record;
  });

  return {
    id: presetProviderStorageId(preset.id),
    name: preset.displayName,
    type: preset.kind,
    baseUrl: preset.baseUrl,
    apiKey,
    models,
  };
}

/**
 * Find the preset id that owns a given `customProviders` record, if any.
 * Used by the login UI to render a row as "connected" when the preset
 * is stored.
 */
export function findPresetIdForCustomProvider(provider: CustomProvider): string | null {
  for (const preset of PRESET_PROVIDERS) {
    if (provider.id === presetProviderStorageId(preset.id)) return preset.id;
  }
  return null;
}
