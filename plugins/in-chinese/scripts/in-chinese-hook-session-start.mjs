#!/usr/bin/env node
import {
  additionalContextOutput,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { SESSION_CONTEXT } from "./lib/policy.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  writeJson(additionalContextOutput(SESSION_CONTEXT));
}

main().catch(() => {});
