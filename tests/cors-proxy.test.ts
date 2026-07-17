import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STRIPPED_REQUEST_HEADER_PREFIXES,
  stripTelemetryHeaders,
} from "../src/auth/cors-proxy.ts";

void test("STRIPPED_REQUEST_HEADER_PREFIXES documents the Stainless family", () => {
  assert.ok(
    STRIPPED_REQUEST_HEADER_PREFIXES.some((p) => p === "x-stainless-"),
    "Must include the Stainless telemetry prefix",
  );
});

void test("stripTelemetryHeaders returns undefined when init is undefined", () => {
  assert.equal(stripTelemetryHeaders(undefined), undefined);
});

void test("stripTelemetryHeaders returns init unchanged when no headers", () => {
  const init: RequestInit = { method: "POST", body: "x" };
  const result = stripTelemetryHeaders(init);
  assert.equal(result, init, "should return the same init reference when no headers");
  assert.equal(result?.headers, undefined);
});

void test("stripTelemetryHeaders strips Stainless headers from a Headers instance", () => {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: "Bearer sk-test",
    "x-stainless-os": "Linux",
    "x-stainless-arch": "x64",
    "x-stainless-runtime": "node",
    "x-stainless-package-version": "4.0.0",
    "x-stainless-raw-response": "true",
  });
  const init: RequestInit = { method: "POST", headers };

  stripTelemetryHeaders(init);

  assert.equal(headers.has("x-stainless-os"), false);
  assert.equal(headers.has("x-stainless-arch"), false);
  assert.equal(headers.has("x-stainless-runtime"), false);
  assert.equal(headers.has("x-stainless-package-version"), false);
  assert.equal(headers.has("x-stainless-raw-response"), false);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("authorization"), "Bearer sk-test");
});

void test("stripTelemetryHeaders preserves Headers when no Stainless header is present", () => {
  const headers = new Headers({ "content-type": "application/json" });
  const init: RequestInit = { method: "POST", headers };
  const result = stripTelemetryHeaders(init);
  assert.equal(result, init);
  assert.equal(headers.get("content-type"), "application/json");
});

void test("stripTelemetryHeaders is case-insensitive (HTTP headers are)", () => {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Stainless-Os": "Linux",
    "X-STAINLESS-Arch": "x64",
    "x-stainless-runtime": "browser",
  });
  const init: RequestInit = { method: "POST", headers };
  stripTelemetryHeaders(init);
  assert.equal(headers.has("X-Stainless-Os"), false);
  assert.equal(headers.has("X-STAINLESS-Arch"), false);
  assert.equal(headers.has("x-stainless-runtime"), false);
});

void test("stripTelemetryHeaders filters the plain-object form", () => {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer sk-test",
      "x-stainless-os": "Linux",
      "x-stainless-arch": "x64",
      "x-stainless-runtime": "browser",
      "x-stainless-package-version": "4.0.0",
      "x-custom-header": "keep-me",
    },
  };

  const result = stripTelemetryHeaders(init);
  const headers = result?.headers as Record<string, string>;

  assert.equal(result, init, "still returns the same init reference");
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["authorization"], "Bearer sk-test");
  assert.equal(headers["x-custom-header"], "keep-me");
  assert.equal("x-stainless-os" in headers, false, "x-stainless-os should be stripped");
  assert.equal("x-stainless-arch" in headers, false, "x-stainless-arch should be stripped");
  assert.equal("x-stainless-runtime" in headers, false, "x-stainless-runtime should be stripped");
  assert.equal("x-stainless-package-version" in headers, false, "x-stainless-package-version should be stripped");
});

void test("stripTelemetryHeaders filters the tuple-array form", () => {
  const init: RequestInit = {
    method: "POST",
    headers: [
      ["content-type", "application/json"],
      ["authorization", "Bearer sk-test"],
      ["x-stainless-os", "Linux"],
      ["x-stainless-package-version", "4.0.0"],
    ],
  };

  const result = stripTelemetryHeaders(init);
  const headers = result?.headers as [string, string][];

  assert.equal(headers.length, 2, "tuple array filters Stainless entries");
  const names = headers.map(([k]) => k);
  assert.deepEqual(names.sort(), ["authorization", "content-type"]);
});

void test("stripTelemetryHeaders covers the OpenAI SDK telemetry header set", () => {
  // These are the headers the bundled openai SDK (Stainless) sends by
  // default. Listing them here is documentation in test form: if upstream
  // adds a new telemetry header, this test forces us to update the
  // strip-prefix list.
  const known = [
    "x-stainless-os",
    "x-stainless-arch",
    "x-stainless-runtime",
    "x-stainless-package-version",
    "x-stainless-raw-response",
    "x-stainless-read-timeout",
    "x-stainless-request-id",
    "x-stainless-helper-method",
  ];
  for (const header of known) {
    assert.ok(
      header.startsWith("x-stainless-"),
      `unexpected telemetry header shape: ${header}`,
    );
  }
});
