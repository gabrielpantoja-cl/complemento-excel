/**
 * UI-level ordered action queue.
 *
 * Needed because some actions (notably `/compact`) run outside the Agent loop
 * (they call `agent.streamFn(...)` directly) and therefore don't set
 * `agent.state.isStreaming`. Without a queue, user input can be lost when
 * compaction rewrites the message list.
 *
 * The queue also owns automatic context protection for its agent (#566):
 * - pre-prompt auto-compaction (existing behavior)
 * - mid-turn auto-compaction between tool-loop continuations (via
 *   `agent.prepareNextTurn`)
 * - one compact-and-retry recovery when a run ends in a context-overflow error
 * - model fallback when a run ends in a quota/rate-limit error (#free-tier)
 */

import type { Agent } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

import { commandRegistry } from "../commands/types.js";
import {
  maybeAutoCompactBeforeContinuation,
  maybeAutoCompactBeforePrompt,
} from "../compaction/auto-compaction.js";
import { recoverFromContextOverflow } from "../compaction/overflow-recovery.js";
import { recoverByModelFallback, type ModelRef } from "../models/fallback-chain.js";

export type QueuedAction =
  | { type: "prompt"; text: string }
  | { type: "command"; name: string; args: string };

export interface ActionQueue {
  enqueuePrompt: (text: string) => void;
  enqueueCommand: (name: string, args: string) => void;
  drainQueuedActions: () => QueuedAction[];
  isBusy: () => boolean;
  shutdown: () => void;
}

interface ActionQueueDisplay {
  setActionQueue: (items: Array<{ type: "prompt" | "command"; label: string; text: string }>) => void;
}

interface BusyIndicatorHost {
  setBusyIndicator: (label: string | null, hint?: string | null) => void;
}

export function createActionQueue(opts: {
  agent: Agent;
  sidebar: BusyIndicatorHost;
  queueDisplay: ActionQueueDisplay;
  autoCompactEnabled: boolean;
  /** Runs compaction for this queue's agent (not the active tab's agent). */
  runCompact: () => Promise<void>;
  /**
   * Model fallback on quota/rate-limit failures. Omitted (or returning an
   * empty chain) disables the behavior, which keeps the queue usable in
   * tests and in runtimes that never configured a chain.
   */
  modelFallback?: {
    isEnabled: () => Promise<boolean> | boolean;
    getChain: () => Promise<readonly ModelRef[]> | readonly ModelRef[];
    resolveModel: (ref: ModelRef) => Model<Api> | null;
    onSwitch?: (model: Model<Api>, failed: Pick<ModelRef, "provider" | "id">) => void;
  };
}): ActionQueue {
  const { agent, sidebar, queueDisplay, autoCompactEnabled } = opts;

  const actions: QueuedAction[] = [];
  let running = false;
  let closed = false;

  const syncDisplay = () => {
    queueDisplay.setActionQueue(
      actions.map((a) => {
        if (a.type === "prompt") return { type: "prompt", label: "Queued", text: a.text };
        return { type: "command", label: `/${a.name}`, text: a.args ? a.args : "" };
      }),
    );
  };

  const isBusy = () => running || agent.state.isStreaming;

  const runCompactWithIndicator = async () => {
    sidebar.setBusyIndicator(
      "Compacting context…",
      "Send messages and Pi will see them after compaction",
    );
    try {
      await opts.runCompact();
    } finally {
      sidebar.setBusyIndicator(null);
    }
  };

  // Mid-turn auto-compaction: checked between tool-loop continuations so a
  // single tool-heavy turn can't overflow a small context window.
  agent.prepareNextTurn = async () => {
    if (closed) return undefined;
    return maybeAutoCompactBeforeContinuation({
      agent,
      enabled: autoCompactEnabled,
      runCompact: runCompactWithIndicator,
    });
  };

  const shutdown = () => {
    closed = true;
    agent.prepareNextTurn = undefined;
    actions.length = 0;
    syncDisplay();
  };

  async function runCommand(name: string, args: string): Promise<void> {
    const cmd = commandRegistry.get(name);
    if (!cmd) throw new Error(`Unknown command: /${name}`);

    // Special-case: show an explicit non-streaming indicator for compaction.
    if (name === "compact") {
      sidebar.setBusyIndicator(
        "Compacting context…",
        "Send messages and Pi will see them after compaction",
      );
      try {
        await cmd.execute(args);
      } finally {
        sidebar.setBusyIndicator(null);
      }
      return;
    }

    await cmd.execute(args);
  }

  const maybeFallbackToNextModel = async (): Promise<void> => {
    const fallback = opts.modelFallback;
    if (!fallback) return;

    try {
      if (!(await fallback.isEnabled())) return;

      const chain = await fallback.getChain();
      if (chain.length === 0) return;

      sidebar.setBusyIndicator("Switching model…", "The previous model ran out of quota");
      try {
        await recoverByModelFallback({
          agent,
          chain,
          resolveModel: fallback.resolveModel,
          onSwitch: fallback.onSwitch,
        });
      } finally {
        sidebar.setBusyIndicator(null);
      }
    } catch (error: unknown) {
      // Never let fallback bookkeeping break the queue: the original error is
      // already in the transcript and surfaced by the error banner.
      console.warn("[pi] Model fallback failed:", error);
    }
  };

  async function process(): Promise<void> {
    if (running || closed) return;
    running = true;

    try {
      // Drain sequentially.
      while (!closed && actions.length > 0) {
        // Never start queued actions while the agent is still streaming.
        await agent.waitForIdle();

        if (closed) break;

        const next = actions.shift();
        if (!next) break;
        syncDisplay();

        if (closed) break;

        if (next.type === "command") {
          await runCommand(next.name, next.args);
          continue;
        }

        // next.type === "prompt"
        await maybeAutoCompactBeforePrompt({
          agent,
          nextUserText: next.text,
          enabled: autoCompactEnabled,
          runCompact: runCompactWithIndicator,
        });

        if (closed) break;
        await agent.prompt(next.text);

        if (closed) break;
        if (autoCompactEnabled) {
          // One compact-and-retry attempt when the run ended in a
          // context-overflow error. Never loops: a second overflow stays in
          // the transcript with an actionable error banner.
          await recoverFromContextOverflow({
            agent,
            runCompact: runCompactWithIndicator,
          });
        }

        if (closed) break;
        // Quota/rate-limit failures: walk the fallback chain so a daily cap
        // reached mid-tasacion does not lose the turn. Bounded by the chain
        // length — each model is tried at most once per prompt.
        await maybeFallbackToNextModel();
      }
    } finally {
      running = false;
      syncDisplay();
    }
  }

  const enqueuePrompt = (text: string) => {
    if (closed) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    actions.push({ type: "prompt", text: trimmed });
    syncDisplay();
    void process();
  };

  const enqueueCommand = (name: string, args: string) => {
    if (closed) return;

    const cmdName = name.trim();
    if (!cmdName) return;

    actions.push({ type: "command", name: cmdName, args: args.trim() });
    syncDisplay();
    void process();
  };

  const drainQueuedActions = (): QueuedAction[] => {
    if (actions.length === 0) {
      return [];
    }

    const drained = [...actions];
    actions.length = 0;
    syncDisplay();
    return drained;
  };

  return { enqueuePrompt, enqueueCommand, drainQueuedActions, isBusy, shutdown };
}
