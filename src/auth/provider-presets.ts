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
 */

import type { CustomProvider } from "@earendil-works/pi-web-ui/dist/storage/stores/custom-providers-store.js";

/** Gateway protocols the preset framework knows how to wire. */
export type PresetGatewayKind = "openai-completions" | "anthropic-messages";

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
  /** Optional list of supported model ids shown in `/model`. */
  supportedModelIds?: readonly string[];
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

export const PRESET_PROVIDERS: ReadonlyArray<PresetProviderConfig> = Object.freeze([
  Object.freeze({
    id: "minimax",
    label: "MiniMax (Token Plan Plus)",
    desc: "MiniMax-M3 (1M context, multimodal) - plan Plus 20 USD/mes",
    apiKeyHint: "Subscription Key de MiniMax (eyJ...)",
    // Token Plan Subscriptions authenticate via the Anthropic Messages API; the
    // OpenAI-compatible /v1/chat/completions endpoint rejects them with
    // (2049 invalid api key). The Anthropic SDK sends the apiKey as the
    // `x-api-key` header, which is exactly what api.minimaxi.com expects.
    baseUrl: "https://api.minimaxi.com/anthropic/v1",
    displayName: "MiniMax",
    providerName: "MiniMax",
    modelId: "MiniMax-M3",
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    supportedModelIds: Object.freeze([
      "MiniMax-M3",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
    ]),
    kind: "anthropic-messages",
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

/**
 * Build a `CustomProvider` record (the storage shape) for the given preset.
 *
 * The runtime model is registered with `provider: preset.providerName` and
 * `baseUrl: preset.baseUrl`. The `kind` decides the gateway protocol and the
 * `api` field on the embedded model — dispatch happens via `model.api` in
 * `pi-ai`'s api-registry.
 */
export function buildPresetProviderRecord(
  preset: PresetProviderConfig,
  apiKey: string,
): CustomProvider {
  if (preset.kind === "anthropic-messages") {
    return {
      id: presetProviderStorageId(preset.id),
      name: preset.displayName,
      type: "anthropic-messages",
      baseUrl: preset.baseUrl,
      apiKey,
      models: [
        {
          id: preset.modelId,
          name: preset.modelId,
          provider: preset.providerName,
          api: "anthropic-messages",
          baseUrl: preset.baseUrl,
          contextWindow: preset.contextWindow,
          maxTokens: Math.min(preset.maxTokens, preset.contextWindow),
          input: ["text"],
          reasoning: false,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          headers: {
            "anthropic-version": preset.anthropicVersion ?? "2023-06-01",
            ...preset.extraHeaders,
          },
        },
      ],
    };
  }

  return {
    id: presetProviderStorageId(preset.id),
    name: preset.displayName,
    type: "openai-completions",
    baseUrl: preset.baseUrl,
    apiKey,
    models: [
      {
        id: preset.modelId,
        name: preset.modelId,
        provider: preset.providerName,
        api: "openai-completions",
        baseUrl: preset.baseUrl,
        contextWindow: preset.contextWindow,
        maxTokens: Math.min(preset.maxTokens, preset.contextWindow),
        input: ["text"],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
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
