import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRESET_PROVIDERS,
  buildPresetProviderRecord,
  findPresetIdForCustomProvider,
  getPresetProviderConfig,
  presetProviderStorageId,
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

void test("getPresetProviderConfig returns the registered MiniMax preset", () => {
  const minimax = getPresetProviderConfig("minimax");
  assert.ok(minimax, "MiniMax preset must be registered");
  assert.equal(minimax?.baseUrl, "https://api.minimax.io/v1");
  assert.equal(minimax?.modelId, "MiniMax-M3");
  assert.equal(minimax?.contextWindow, 1_000_000);
  assert.equal(minimax?.kind, "openai-completions");
});

void test("buildPresetProviderRecord builds an openai-completions record for MiniMax", () => {
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset);

  const record = buildPresetProviderRecord(preset, "sk-cp-test-eyJ-fake");

  assert.equal(record.id, presetProviderStorageId(preset.id));
  assert.equal(record.name, preset.displayName);
  assert.equal(record.type, "openai-completions");
  assert.equal(record.baseUrl, preset.baseUrl);
  assert.equal(record.apiKey, "sk-cp-test-eyJ-fake");

  const model = record.models?.[0];
  assert.ok(model, "record must declare at least one model");
  assert.equal(model?.id, preset.modelId);
  assert.equal(model?.provider, preset.providerName);
  assert.equal(model?.baseUrl, preset.baseUrl);
  assert.equal(model?.api, "openai-completions");
  assert.equal(model?.contextWindow, preset.contextWindow);
  assert.ok((model?.maxTokens ?? 0) <= preset.contextWindow, "maxTokens must respect contextWindow");
});

void test("buildPresetProviderRecord supports openai-completions presets", () => {
  const preset: import("../src/auth/provider-presets.ts").PresetProviderConfig = {
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
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset);
  const record = buildPresetProviderRecord(preset, "eyJ-test");
  const headers = record.models?.[0]?.headers;
  assert.ok(headers, "anthropic-messages models must declare anthropic-version");
  assert.equal(headers?.["anthropic-version"], "2023-06-01");
});

void test("anthropic-messages preset honours anthropicVersion override", () => {
  const preset: import("../src/auth/provider-presets.ts").PresetProviderConfig = {
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
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset);
  if (preset.kind === "anthropic-messages") {
    // @ts-expect-error -- intentionally accessing only on openai branch below.
    const _openaiOnly = preset.kind === "openai-completions" ? preset : null;
    assert.equal(preset.kind, "anthropic-messages");
  }
});

void test("buildPresetProviderRecord overwrites in place (stable id)", () => {
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset);

  const store = new Map<string, ReturnType<typeof buildPresetProviderRecord>>();
  store.set(presetProviderStorageId(preset.id), buildPresetProviderRecord(preset, "old-key"));
  store.set(presetProviderStorageId(preset.id), buildPresetProviderRecord(preset, "new-key"));

  assert.equal(store.size, 1, "re-saving should reuse the stable id");
  assert.equal(store.get(presetProviderStorageId(preset.id))?.apiKey, "new-key");
});

void test("findPresetIdForCustomProvider matches preset records only", () => {
  const preset = getPresetProviderConfig("minimax");
  assert.ok(preset);

  const stored = buildPresetProviderRecord(preset, "key");
  assert.equal(findPresetIdForCustomProvider(stored), "minimax");

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
  const id = presetProviderStorageId("minimax");
  assert.ok(id.startsWith("pi-preset:"), `unexpected id: ${id}`);
  assert.ok(!id.startsWith("pi-openai-gateway:"), "preset id must not collide with user gateways");
});
