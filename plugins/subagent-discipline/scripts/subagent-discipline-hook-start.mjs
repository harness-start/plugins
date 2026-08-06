#!/usr/bin/env node
import {
  additionalContextOutput,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { buildSubagentStartContext } from "./lib/policy.mjs";
import { loadConfig } from "./lib/config.mjs";
import { resolveGitRoot, readCwd } from "./lib/workspace.mjs";
import {
  buildAndWriteSpawn,
  tryEnterHygieneFlow,
} from "./lib/enter-flow.mjs";
import { DEFAULT_HYGIENE } from "./lib/hygiene.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  const cwd = readCwd(event);
  const gitRoot = cwd ? resolveGitRoot(cwd) : null;
  const { evidence } = await loadConfig(gitRoot);
  const includeHygiene = evidence.mode !== "off";

  writeJson(
    additionalContextOutput(buildSubagentStartContext({ includeHygiene })),
  );

  // State machine (ledger / cleanup / gitignore) requires agentId.
  if (evidence.mode === "off") return;

  const ctx = tryEnterHygieneFlow(event, { ...DEFAULT_HYGIENE, ...evidence });
  if (!ctx.entered) return;

  try {
    buildAndWriteSpawn(ctx);
  } catch {
    // best-effort
  }
}

main().catch(() => {});
