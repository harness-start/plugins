#!/usr/bin/env node
import { extractToolInput, extractToolName, preToolDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { collectMobileLockfiles, mobileLockfileDeny } from "./checks/lockfiles.mjs";

const event = await readStdinJson();
if (!event.__parseError) {
  const toolName = extractToolName(event);
  if (isWriteTool(toolName) || isShellTool(toolName)) {
    const targets = collectMobileLockfiles(toolName, extractToolInput(event));
    if (targets.length) writeJson(preToolDeny(mobileLockfileDeny(targets)));
  }
}
