# Upstream divergences from pi-mono

**Last reviewed:** 2026-11-04

This document records every place Pi for Excel intentionally diverges from
[pi-mono](https://github.com/badlogic/pi-mono) / `@earendil-works/pi-coding-agent`
behavior, with rationale and status for each.

**Philosophy:** pi-mono is our upstream and the default is to stay aligned.
Mario is thoughtful and experienced â€” if upstream does something a certain way,
we assume there's a good reason. We only diverge when our Excel-specific
architecture genuinely demands it, and we document every case here so divergences
don't accumulate silently.

---

## 1. Mid-session model switching (fork vs in-place)

| | pi-mono | Pi for Excel (current) |
|---|---|---|
| Empty session | Switch in place | Switch in place |
| Non-empty session (default) | Switch in place | Switch in place |
| Non-empty session (opt-in) | N/A | Fork to a new tab with the new model |

**Rationale:** When you switch models mid-conversation, the API provider's
cached prefix becomes invalid (different model = different cache key). Forking
can preserve the original tab's cache if the user switches back, but forcing
fork by default is surprising UX for many users.

**Status:** #428 introduced fork-on-non-empty. #442 changed default back to
pi-mono parity (in-place), and kept fork as an advanced opt-in setting.

- **Default:** in-place switch (parity)
- **Option:** fork to new tab for non-empty sessions

**Files:** `src/models/switch-behavior.ts`, `src/taskpane/init.ts`
(`applyModelSelection`, `cloneRuntimeToNewTab`),
`src/commands/builtins/settings-overlay.ts`

---

## 2. Tool refresh fingerprinting (no-op suppression)

| | pi-mono | Pi for Excel |
|---|---|---|
| When tools change | Direct `setTools()` on explicit user action | Event-driven capability refreshes; apply `setTools()` only when tool fingerprint or extension tool revision changes |

**Rationale:** This is not a disagreement with upstream â€” it's compensating for
a different lifecycle. Pi-mono's tool set only changes when the user explicitly
does something (e.g. `/tools`). In Excel, capability refresh passes run on many
events (focus/visibility return, integrations/connections/skills/rules/execution-mode/experimental updates, extension activation).

Each refresh rebuilds tool objects. Without a guard, every pass would assign
`agent.state.tools = ...` even when schema metadata is identical.

We therefore gate tool updates by:
- stable metadata fingerprint (`name`, `label`, `description`, `parameters`)
- extension tool revision (increments on extension tool register/unregister/reload)

The revision keeps schema-stable hot-reload correctness (new `execute` handler,
same schema) without blanket eager updates on every refresh pass.

**Status:** Shipped in #436, refined in #444 with extension tool revision
tracking. Divergence remains architecture-driven.

**Files:** `src/taskpane/runtime-utils.ts` (`createRuntimeToolFingerprint`,
`shouldApplyRuntimeToolUpdate`), `src/extensions/runtime-manager.ts`
(`getToolRevision`), applied in `src/taskpane/init.ts`

---

## 3. Extension `llm.complete` side-session namespacing

| | pi-mono | Pi for Excel |
|---|---|---|
| Extension LLM calls | No equivalent host-side `llm.complete` API | Scoped to a separate session ID per extension |

**Rationale:** Extensions can make their own LLM calls independently of the main
conversation (e.g. an extension that summarises a cell selection on button
click). If these "side requests" shared the main session ID, the provider would
see an unexpected request appear mid-conversation â€” different system prompt,
different messages, no tools â€” and could invalidate the main conversation's
cache.

With namespacing, an extension's call is tagged as
`{agentSessionId}::ext-llm:{extensionId}` instead of the main session ID. The
provider treats it as a completely separate conversation.

**Status:** Implemented. This is new territory (pi-mono doesn't expose a
host-side `llm.complete` surface), not a disagreement with upstream.

**Files:** `src/extensions/runtime-manager-helpers.ts`
(`createExtensionLlmCompletionSessionId`), used in
`src/extensions/runtime-manager.ts` (`runExtensionLlmCompletion`)

---

## 4. Earlier compaction trigger for large context windows

| | pi-mono | Pi for Excel |
|---|---|---|
| Hard trigger | `contextWindow - reserveTokens` | `min(contextWindow - reserveTokens, qualityCap)` |
| Quality cap | None | 88% for â‰¥128k windows, 85% for â‰¥200k windows |
| Soft warning | None | 70% of hard trigger (floor), or hard âˆ’ 5% of window |

**Rationale:** Response quality tends to degrade before you literally exhaust the
context window â€” the model starts losing track of earlier instructions and
context. By compacting slightly earlier (at 85â€“88% instead of ~92%), we trade a
small amount of raw context capacity for more consistent quality in long
sessions.

The base reserve/keep-recent defaults still mirror pi-mono (16,384 / 20,000
tokens). We only adjust *when* compaction fires, not the summarisation call
shape.

**Status:** Shipped. Documented in `docs/architecture/context-management-policy.md` (Slice 5)
and `docs/features/compaction.md`. The call shape (isolated summarizer request) still
matches upstream.

**Files:** `src/compaction/defaults.ts` (`getCompactionThresholds`,
`LARGE_CONTEXT_HARD_RATIO`, `XL_CONTEXT_HARD_RATIO`)

Since #566, the *trigger points* are closer to upstream again: like pi-mono's
agent-session, we now also check budgets mid-turn between tool-loop
continuations (`Agent.prepareNextTurn`) and run one compact-and-retry recovery
pass when a request fails with a context-overflow error
(`src/compaction/overflow-recovery.ts`, using pi-ai's `isContextOverflow`).
What still differs is the quality cap above and the simpler split-turn handling
(our compaction cuts mid-turn via `findCutIndex` instead of generating separate
history + turn-prefix summaries).

---

## 5. Context budgets scaled to small context windows

| | pi-mono | Pi for Excel |
|---|---|---|
| Tool output cap | fixed 50KB / 2000 lines | scaled linearly below 128k windows (floors 8KB / 200 lines) |
| Verbatim recent tool results | n/a (no model-facing shaping layer) | 6 at â‰¥128k, scaled down to a floor of 2 |

**Rationale:** Pi for Excel supports custom gateways with 32kâ€“65k windows where
a single fixed-cap tool result can consume ~20% of the window. Scaling keeps
worst-case tool-loop context proportional to the model's actual capacity (#566).

**Files:** `src/context/window-budgets.ts`, wired in `src/taskpane/init.ts`
(tool truncation limits) and `src/messages/convert-to-llm.ts` (history shaping).

---

## 6. Independent model catalog (preset providers)

| | pi-mono | Tasaciones |
|---|---|---|
| Selectable models | Whatever `@earendil-works/pi-ai`'s generated registry ships | Registry **plus** a fork-owned catalog declared in `src/auth/provider-presets.ts` |

**Rationale:** The add-in pins `pi-ai` (see `scripts/check-pi-deps-lockstep.mjs`),
and its `models.generated.js` only grows when that pin moves. Model releases do
not wait for our dependency bumps: as of 2026-11-04 the pinned 0.79.1 registry
tops out at `gpt-5.5`, so every GPT-6 model and every OpenRouter free model is
unselectable through the built-in providers.

Preset providers already existed for MiniMax token plans. Extending them with a
per-preset `models[]` list turns that mechanism into a catalog we control: each
entry is stored as a `customProviders` record, which the model picker lists
alongside built-ins. Adding a model is a one-line change with no dependency bump
and no upstream coordination.

**Trade-off:** context windows and model ids are hand-maintained here, so they
can drift from reality. `tests/provider-presets.test.ts` guards the invariants
that are checkable offline (`:free` suffix, `maxTokens <= contextWindow`, unique
ids, default model present); the values themselves must be re-verified against
`GET https://openrouter.ai/api/v1/models` when the catalog is edited.

**Files:** `src/auth/provider-presets.ts`, `src/ui/provider-login.ts`
(`ALL_PROVIDERS`), `src/auth/custom-gateways.ts`
(`findCustomProviderModelByRef`).

---

## 7. Model fallback on quota failures

| | pi-mono | Tasaciones |
|---|---|---|
| Run ends in 402/429 | Error surfaces, turn is lost | Switch to the next model in a configured chain and continue the turn |

**Rationale:** The fork's default setup is OpenRouter's free tier, which is
capped per UTC day (50 requests, or 1,000 once >= 10 credits have been purchased
all-time) and at 20 requests/minute. A tasación turn can burn several requests,
so hitting the cap mid-session is routine rather than exceptional — and losing a
turn halfway through linking a `cuadro de referenciales` is expensive.

The mechanism mirrors the existing context-overflow recovery (drop the trailing
failure, fix the condition, `agent.continue()`), with one deliberate difference:
overflow recovery retries **once**, while quota recovery walks the chain, since
one model's daily cap says nothing about the next model's. The walk is bounded —
each model is attempted at most once per prompt.

Detection is deliberately narrow: 401/403/400 and aborts never trigger a switch,
because every model in the chain would fail those identically and the user would
just watch the chain burn down.

**Files:** `src/models/fallback-chain.ts`, wired in
`src/taskpane/action-queue.ts`; quota visibility in
`src/auth/openrouter-quota.ts` + `src/taskpane/quota-indicator.ts`.

---

## Non-divergences worth noting

### Compaction call shape

Both pi-mono and Pi for Excel use the same pattern: serialize conversation to
text, send an isolated summarization request, inject the structured summary as a
user message. We considered a "cache-safe fork compaction" approach (reusing the
main runtime prefix) but **deferred** it â€” see
`docs/archive/issue-424-compaction-call-shape.md`.

### Session ID stability

Both keep `agent.sessionId` stable for the lifetime of a session. No divergence.

### Tool disclosure on continuations

Both include tools on every call (including tool-result continuations) so
multi-step loops work. No divergence.
