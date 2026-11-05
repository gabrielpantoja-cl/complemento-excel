/**
 * Stub for @lmstudio/sdk in the Office Add-in browser bundle.
 *
 * The real SDK is written against zod 3. Our `overrides` pin zod to 4.x
 * repo-wide (required by GHSA-mrhx-c7xc-m3w5, which has no patched 3.x
 * release), and zod 4 changed `z.record(z.enum([...]), ...)` to require
 * every enum key to be present. The SDK builds such a record at module
 * scope for its GPU env-var allowlist (`HSA_OVERRIDE_GFX_VERSION`), so
 * merely *importing* it throws:
 *
 *   Error: Invalid default value for field envVars: ... expected string,
 *   received undefined
 *
 * pi-web-ui's `utils/model-discovery.js` imports the SDK statically, so
 * that throw happened during taskpane module init and left the sidebar
 * blank. This fork never offers LM Studio as a provider (no reference in
 * `src/`), so stubbing it removes the crash and drops an unused SDK from
 * the bundle.
 *
 * `discoverLMStudioModels()` wraps `new LMStudioClient(...)` in a
 * try/catch, so throwing here surfaces as a normal "LM Studio discovery
 * failed" error instead of breaking startup.
 *
 * To re-enable LM Studio: drop this alias from `buildBrowserAliasMap()`
 * and scope the zod override so `@lmstudio/sdk` keeps zod 3, then
 * allowlist the advisory for that path in `audit-ci.jsonc`.
 */

export class LMStudioClient {
  constructor() {
    throw new Error(
      "LM Studio is not available in this build: @lmstudio/sdk is stubbed out (zod 4 incompatibility).",
    );
  }
}

export default { LMStudioClient };
