import assert from "node:assert/strict";
import { test } from "node:test";

import {
  serializeConversationAsMarkdown,
  type MarkdownLimits,
} from "../src/commands/builtins/export.ts";

const LIMITS: MarkdownLimits = {
  maxUserChars: 8_000,
  maxAssistantChars: 16_000,
  maxToolResultChars: 8_000,
};

void test("markdown transcript: user prompt renders as **User:** block", () => {
  const messages = [
    {
      role: "user",
      content: "Resume this tasación worksheet.",
      timestamp: 1,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*\*User:\*\*/);
  assert.match(md, /Resume this tasaci\u00f3n worksheet\./);
});

void test("markdown transcript: assistant role shows model label and tool calls", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me read the range A1:D20." },
        {
          type: "toolCall",
          id: "tc1",
          name: "read_range",
          arguments: { range: "A1:D20" },
        },
      ],
      model: "claude-sonnet-test",
      api: "openai-compat",
      provider: "anthropic-test",
      usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
      stopReason: "toolUse",
      timestamp: 2,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*\*Assistant \(claude-sonnet-test\):\*\*/);
  assert.match(md, /Let me read the range A1:D20\./);
  assert.match(md, /\*Tool calls:\*/);
  assert.match(md, /- `read_range` — `\{[^}]*\}/u);
  assert.match(md, /read_range/);
  assert.match(md, /A1:D20/);
});

void test("markdown transcript: tool result is italicized with tool name", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "read_range",
      content: [{ type: "text", text: "| A | B |\n| 1 | 2 |" }],
      isError: false,
      timestamp: 3,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*Tool result for `read_range`:\*/);
  assert.match(md, /\| A \| B \|/);
  // No `(error)` suffix when isError is false.
  assert.doesNotMatch(md, /\*Tool result for `read_range` \(error\):\*/);
});

void test("markdown transcript: errored tool result is marked with (error)", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "write_cells",
      content: [{ type: "text", text: "Permission denied" }],
      isError: true,
      timestamp: 4,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*Tool result for `write_cells` \(error\):\*/);
  assert.match(md, /Permission denied/);
});

void test("markdown transcript: artifact messages are skipped", () => {
  const messages = [
    { role: "artifact", artifactId: "ignored", content: "should not appear", timestamp: 1 },
    {
      role: "user",
      content: "Hello",
      timestamp: 2,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.doesNotMatch(md, /should not appear/);
  assert.match(md, /Hello/);
});

void test("markdown transcript: thinking block is wrapped in italics block", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "analyzing the 7 homologation factors" },
        { type: "text", text: "The biggest factor is location." },
      ],
      model: "claude-sonnet-test",
      api: "openai-compat",
      provider: "anthropic-test",
      usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
      stopReason: "stop",
      timestamp: 1,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*Thinking:\*/);
  assert.match(md, /analyzing the 7 homologation factors/);
  assert.match(md, /The biggest factor is location\./);
});

void test("markdown transcript: compaction summary is captured", () => {
  const messages = [
    {
      role: "compactionSummary",
      summary: "User asked about faja vial. Assistant applied DL 2.186 indemnity calc.",
      timestamp: 1,
    },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*Compaction summary:\*/);
  assert.match(md, /faja vial/);
});

void test("markdown transcript: messages are joined with horizontal rule separators", () => {
  const messages = [
    { role: "user", content: "Q1", timestamp: 1 },
    { role: "user", content: "Q2", timestamp: 2 },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  assert.match(md, /\*\*User:\*\*\s*\n\nQ1\s*\n\n---\n\n\*\*User:\*\*\s*\n\nQ2/u);
});

void test("markdown transcript: respects truncation limits on long user messages", () => {
  const longText = "x".repeat(20_000);
  const tightLimits: MarkdownLimits = {
    maxUserChars: 200,
    maxAssistantChars: 200,
    maxToolResultChars: 200,
  };

  const messages = [
    { role: "user", content: longText, timestamp: 1 },
  ];

  const md = serializeConversationAsMarkdown(messages, tightLimits, "claude-sonnet-test");

  assert.ok(md.length < 400, `expected truncated output, got ${md.length} chars`);
  assert.match(md, /\u2026\[truncated\]\u2026/);
});

void test("markdown transcript: empty user message is skipped", () => {
  const messages = [
    { role: "user", content: "   \n  ", timestamp: 1 },
    { role: "user", content: "actual message", timestamp: 2 },
  ];

  const md = serializeConversationAsMarkdown(messages, LIMITS, "claude-sonnet-test");

  // Whitespace-only message produces no **User:** block, only the second one does.
  assert.strictEqual((md.match(/\*\*User:\*\*/g) ?? []).length, 1);
  assert.match(md, /actual message/);
});
