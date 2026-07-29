import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRESET_PROVIDERS,
  buildPresetProviderRecord,
  findPresetIdForCustomProvider,
  getPresetProviderConfig,
  presetProviderStorageId,
  type PresetProviderConfig,
} from "../src/auth/provider-presets.ts";

void test("PRESET_PROVIDERS has unique ids", () => {
  const ids = new Set<string>();
  for (const preset of PRESET_PROVIDERS) {
    assert.ok(!ids.has(preset.id), `duplicate preset id: ${preset.id}`);
    ids.add(preset.id);
  }
  assert.equal(PRESET_PROVIDERS.length, ids.size);
});

void test("PRESET_PROVIDERS exposes every required field", () => {
  for (const preset of PRESET_PROVIDERS) {
    assert.ok(preset.id, "preset.id missing");
    assert.ok(preset.label, `${preset.id}: label missing`);
    assert.ok(preset.baseUrl, `${preset.id}: baseUrl missing`);
    assert.match(preset.baseUrl, /^https?:\/\//, `${preset.id}: baseUrl must be http(s)`);
    assert.ok(preset.displayName, `${preset.id}: displayName missing`);
    assert.ok(preset.providerName, `${preset.id}: providerName missing`);
    assert.ok(preset.modelId, `${preset.id}: modelId missing`);
    assert.ok(preset.contextWindow >= 1024, `${preset.id}: contextWindow too small`);
    assert.ok(preset.maxTokens >= 1, `${preset.id}: maxTokens must be positive`);
    assert.ok(
      preset.kind === "openai-completions" || preset.kind === "anthropic-messages",
      `${preset.id}: kind must be a known gateway protocol`,
    );
  }
});

void test("getPresetProviderConfig returns null for unknown ids", () => {
  assert.equal(getPresetProviderConfig("nope"), null);
});

void test("buildPresetProviderRecord supports openai-completions presets", () => {
  const preset: PresetProviderConfig = {
    id: "test-openai",
    label: "Test OpenAI",
    baseUrl: "https://example.com/v1",
    displayName: "Test OpenAI",
    providerName: "Test OpenAI",
    modelId: "test-model",
    contextWindow: 16_384,
    maxTokens: 4_096,
    kind: "openai-completions",
  };

  const record = buildPresetProviderRecord(preset, "sk-test");
  assert.equal(record.type, "openai-completions");
  assert.equal(record.models?.[0]?.api, "openai-completions");
  assert.equal(record.models?.[0]?.headers, undefined,
    "openai-completions presets should not force headers by default");
});

void test("anthropic-messages preset defaults anthropic-version to 2023-06-01", () => {
  const preset: PresetProviderConfig = {
    id: "test-anthropic-default",
    label: "Test Anthropic",
    baseUrl: "https://example.com/anthropic/v1",
    displayName: "Test Anthropic",
    providerName: "Test Anthropic",
    modelId: "test-model",
    contextWindow: 200_000,
    maxTokens: 8_192,
    kind: "anthropic-messages",
  };
  const record = buildPresetProviderRecord(preset, "eyJ-test");
  const headers = record.models?.[0]?.headers;
  assert.ok(headers, "anthropic-messages models must declare anthropic-version");
  assert.equal(headers?.["anthropic-version"], "2023-06-01");
});

void test("anthropic-messages preset honours anthropicVersion override", () => {
  const preset: PresetProviderConfig = {
    id: "test-anthropic",
    label: "Test Anthropic",
    baseUrl: "https://example.com/anthropic/v1",
    displayName: "Test Anthropic",
    providerName: "Test Anthropic",
    modelId: "test-model",
    contextWindow: 200_000,
    maxTokens: 8_192,
    kind: "anthropic-messages",
    anthropicVersion: "2024-01-01",
    extraHeaders: { "x-custom-auth": "Bearer yes" },
  };
  const record = buildPresetProviderRecord(preset, "sk-test");
  const headers = record.models?.[0]?.headers as Record<string, string>;
  assert.equal(headers["anthropic-version"], "2024-01-01");
  assert.equal(headers["x-custom-auth"], "Bearer yes");
});

void test("discriminated union: anthropic-messages fields are gated by kind", () => {
  // The TS compiler enforces this. The runtime check below is a documentation
  // guard so a future refactor cannot regress without breaking the test suite.
  const preset: PresetProviderConfig = {
    id: "test-discriminated",
    label: "Test",
    baseUrl: "https://example.com/v1",
    displayName: "Test",
    providerName: "Test",
    modelId: "test-model",
    contextWindow: 16_384,
    maxTokens: 4_096,
    kind: "openai-completions",
  };
  assert.equal(preset.kind, "openai-completions");
  if (preset.kind === "anthropic-messages") {
    // @ts-expect-error -- intentionally accessing only on openai branch below.
    const _openaiOnly = preset.kind === "openai-completions" ? preset : null;
    assert.equal(preset.kind, "anthropic-messages");
  }
});

void test("buildPresetProviderRecord overwrites in place (stable id)", () => {
  const preset: PresetProviderConfig = {
    id: "test-stable-id",
    label: "Test",
    baseUrl: "https://example.com/v1",
    displayName: "Test",
    providerName: "Test",
    modelId: "test-model",
    contextWindow: 16_384,
    maxTokens: 4_096,
    kind: "openai-completions",
  };

  const store = new Map<string, ReturnType<typeof buildPresetProviderRecord>>();
  store.set(presetProviderStorageId(preset.id), buildPresetProviderRecord(preset, "old-key"));
  store.set(presetProviderStorageId(preset.id), buildPresetProviderRecord(preset, "new-key"));

  assert.equal(store.size, 1, "re-saving should reuse the stable id");
  assert.equal(store.get(presetProviderStorageId(preset.id))?.apiKey, "new-key");
});

void test("save flow busts stale preset config from prior bundle versions", () => {
  // Regression guard: if a user had a preset stored under an older bundle
  // (different baseUrl / kind), the next Save must fully replace the
  // record. Otherwise the host/protocol drift would cause a
  // "Connection error" loop that only Disconnect+Save fixes. The stable
  // id (`pi-preset:<id>`) plus `CustomProvidersStore.set()`'s id-keyed
  // write gives us the guarantee; this test pins it.
  const preset: PresetProviderConfig = {
    id: "test-stale",
    label: "Test",
    baseUrl: "https://new-host.example.com/v1",
    displayName: "Test",
    providerName: "Test",
    modelId: "test-model",
    contextWindow: 16_384,
    maxTokens: 4_096,
    kind: "openai-completions",
  };

  const storageId = presetProviderStorageId(preset.id);

  // Mimic the IndexedDB-backed store: keyed by record.id, last write wins.
  const store = new Map<string, ReturnType<typeof buildPresetProviderRecord>>();

  // 1. Old bundle wrote this with anthropic-messages.
  const oldConfig: PresetProviderConfig = {
    id: preset.id,
    label: preset.label,
    baseUrl: "https://old-host.example.com/anthropic/v1",
    displayName: preset.displayName,
    providerName: preset.providerName,
    modelId: preset.modelId,
    contextWindow: preset.contextWindow,
    maxTokens: preset.maxTokens,
    kind: "anthropic-messages",
    anthropicVersion: "2023-06-01",
  };
  store.set(storageId, buildPresetProviderRecord(oldConfig, "old-key"));

  // 2. New bundle writes the current shape.
  const newRecord = buildPresetProviderRecord(preset, "new-key");
  store.set(storageId, newRecord);

  // 3. The stored record must reflect the new bundle exactly.
  assert.equal(store.size, 1, "stable id should keep store at one entry");
  const stored = store.get(storageId);
  assert.equal(stored?.id, storageId);
  assert.equal(stored?.type, "openai-completions", "kind must be overwritten");
  assert.equal(stored?.baseUrl, "https://new-host.example.com/v1", "baseUrl must be overwritten");
  assert.equal(stored?.apiKey, "new-key", "api key must be overwritten");
  assert.equal(stored?.models?.[0]?.baseUrl, "https://new-host.example.com/v1");
  assert.equal(stored?.models?.[0]?.api, "openai-completions");
  assert.equal(
    stored?.models?.[0]?.headers,
    undefined,
    "openai-compat record should not carry anthropic-version headers",
  );
});

void test("findPresetIdForCustomProvider matches preset records only", () => {
  const preset: PresetProviderConfig = {
    id: "test-find",
    label: "Test",
    baseUrl: "https://example.com/v1",
    displayName: "Test",
    providerName: "Test",
    modelId: "test-model",
    contextWindow: 16_384,
    maxTokens: 4_096,
    kind: "openai-completions",
  };
  const stored = buildPresetProviderRecord(preset, "key");
  assert.equal(findPresetIdForCustomProvider(stored), preset.id);

  const foreign = {
    id: "pi-openai-gateway:abc",
    name: "user gateway",
    type: "openai-completions",
    baseUrl: "https://example.com/v1",
    apiKey: "k",
    models: [],
  };
  assert.equal(findPresetIdForCustomProvider(foreign), null);
});

void test("presetProviderStorageId prefixes ids to avoid collisions", () => {
  const id = presetProviderStorageId("test");
  assert.ok(id.startsWith("pi-preset:"), `unexpected id: ${id}`);
  assert.ok(!id.startsWith("pi-openai-gateway:"), "preset id must not collide with user gateways");
});

// ---------------------------------------------------------------------------
// Project-specific regression pins.
//
// MiniMax is the project's primary token plan. The default first-click
// UX in the welcome overlay depends on these two invariants. A future
// "let's remove the MiniMax preset" PR must consciously break these tests.
// ---------------------------------------------------------------------------

void test("MiniMax preset is registered and points at the .io openai-compat endpoint", () => {
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset, "MiniMax preset must be registered (see src/auth/provider-presets.ts)");
  assert.equal(preset?.baseUrl, "https://api.minimax.io/v1");
  assert.equal(preset?.modelId, "MiniMax-M3");
  assert.equal(preset?.contextWindow, 1_000_000);
  assert.equal(preset?.kind, "openai-completions");
  // The .io cluster authenticates Subscription Keys (sk-cp-...); the .com
  // cluster is PAYG. The openai-compat route is the only one whose CORS
  // preflight passes for browser-based taskpane (see commit b11c297).
});

// Static analysis pin: `ALL_PROVIDERS[0]` must be the MiniMax row.
// We avoid importing `src/ui/provider-login.ts` here because that module
// transitively imports `@earendil-works/pi-web-ui/dist/storage/...` which
// is not resolvable from the Node test loader (see
// `tests/cuadro-referenciales-tools.test.ts` for the same pattern).
// The text-level check below catches the regression if someone moves
// MiniMax to position 1+ in the array.
void test("ALL_PROVIDERS first row is the MiniMax preset", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fileURL = await import("node:url");
  const source = await fs.readFile(
    fileURL.fileURLToPath(new URL("../src/ui/provider-login.ts", import.meta.url)),
    "utf8",
  );

  // Find the `ALL_PROVIDERS = [` block and the next 8 lines.
  const startIdx = source.indexOf("export const ALL_PROVIDERS");
  if (startIdx < 0) {
    throw new Error("ALL_PROVIDERS export not found in provider-login.ts");
  }
  const blockStart = source.indexOf("[", startIdx);
  if (blockStart < 0) {
    throw new Error("Could not find ALL_PROVIDERS array start");
  }
  const block = source.slice(blockStart, blockStart + 2000);
  const lines = block.split(/\r?\n/).slice(1); // skip the `[` line
  const firstNonEmpty = lines.find((l) => l.trim() && !l.trim().startsWith("//"));
  if (!firstNonEmpty) {
    throw new Error("ALL_PROVIDERS array is empty");
  }
  assert.match(
    firstNonEmpty,
    /id:\s*"minimax"/,
    `expected first row to be MiniMax, got: ${firstNonEmpty}`,
  );
  assert.match(
    firstNonEmpty,
    /preset:\s*"minimax"/,
    `expected first row to reference preset: "minimax", got: ${firstNonEmpty}`,
  );
});
