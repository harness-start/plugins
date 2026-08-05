/**
 * Symfony protected paths PreToolUse entry.
 *
 * One process per event; denies writes into Flex/runtime/build generated
 * paths. A clean run exits 0 without output.
 */

import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  extractFilePath,
  preToolDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool } from "./lib/matchers.mjs";
import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "./checks/protected-paths.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);
  if (!isWriteTool(toolName)) process.exit(0);

  const filePath = extractFilePath(toolInput);
  if (!filePath) process.exit(0);

  const violation = protectedPathViolation(filePath);
  if (violation) {
    writeJson(preToolDeny(protectedPathDenyMessage(filePath, violation)));
    process.exit(0);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
