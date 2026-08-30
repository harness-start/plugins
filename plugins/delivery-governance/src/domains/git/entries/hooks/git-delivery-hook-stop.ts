#!/usr/bin/env node

import {
  extractCwd, extractSessionId, readStdinJson,
} from "../../lib/hook-io.js";
import { resolveRepoRoot } from "../../checks/file-checks.js";
import { releaseWorktreeMutationLease } from "../../lib/mutation-lease.js";

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const root = resolveRepoRoot(extractCwd(event));
  if (root) releaseWorktreeMutationLease(root, extractSessionId(event));
}
