#!/usr/bin/env node
import {
  additionalContextOutput,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { SUBAGENT_CONTEXT } from "./lib/policy.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  writeJson(additionalContextOutput(SUBAGENT_CONTEXT));
}

main().catch(() => {});
