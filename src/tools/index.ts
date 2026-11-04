/**
 * Tool registry — creates all built-in tools for the agent.
 *
 * Canonical source of truth for core tools lives in `src/tools/registry.ts`.
 * Experimental/non-core tools are appended here.
 */

import { createCoreTools } from "./registry.js";
import type { SkillReadCache } from "../skills/read-cache.js";
import { createTmuxTool } from "./tmux.js";
import { createPythonRunTool } from "./python-run.js";
import { createLibreOfficeConvertTool } from "./libreoffice-convert.js";
import { createPythonTransformRangeTool } from "./python-transform-range.js";
import { createFilesTool } from "./files.js";
import { createReadPdfTool } from "./read-pdf.js";
import { createExecuteOfficeJsTool } from "./execute-office-js.js";
import {
  createExtensionsManagerTool,
  type ExtensionsManagerToolRuntime,
} from "./extensions-manager.js";

export interface CreateAllToolsOptions {
  getExtensionManager?: () => ExtensionsManagerToolRuntime | null;
  getSessionId?: () => string | null;
  skillReadCache?: SkillReadCache;
  /**
   * Input modalities the active model declares (`Model.input`). `read_pdf`
   * uses it to withhold page images from a text-only model instead of letting
   * the provider reject them.
   */
  getActiveModelInput?: () => readonly string[] | undefined;
}

export function createAllTools(options: CreateAllToolsOptions = {}) {
  const getExtensionManager = options.getExtensionManager ?? (() => null);

  return [
    ...createCoreTools({
      skills: {
        getSessionId: options.getSessionId,
        readCache: options.skillReadCache,
      },
    }),
    createTmuxTool(),
    createPythonRunTool(),
    createLibreOfficeConvertTool(),
    createPythonTransformRangeTool(),
    createFilesTool(),
    createReadPdfTool({ getActiveModelInput: options.getActiveModelInput }),
    createExecuteOfficeJsTool(),
    createExtensionsManagerTool({ getManager: getExtensionManager }),
  ];
}
