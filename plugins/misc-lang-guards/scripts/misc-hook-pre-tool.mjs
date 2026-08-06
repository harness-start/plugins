#!/usr/bin/env node
import { extractToolInput, extractToolName, preToolDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { collectMiscLockfiles, miscLockfileDeny } from "./checks/lockfiles.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const tool = extractToolName(event); if (isWriteTool(tool) || isShellTool(tool)) { const result = collectMiscLockfiles(tool, extractToolInput(event)); if (result.targets.length || result.bypass) writeJson(preToolDeny(miscLockfileDeny(result))); } }
