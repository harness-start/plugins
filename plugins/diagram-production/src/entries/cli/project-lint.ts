#!/usr/bin/env node

import { loadDiagramProject, validateDiagramModel } from "../../lib/contract.js";
import { assertDiagramProjectRoot } from "../../lib/writer.js";

async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]); const findings = validateDiagramModel(await loadDiagramProject(root), { stage: "source" });
  if (findings.length) { process.stderr.write(`${findings.map(({ code, path, message }) => `${path} [${code}] ${message}`).join("\n")}\n`); process.exitCode = 2; return; }
  process.stdout.write(`${JSON.stringify({ verdict: "pass" })}\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[diagram-project-lint] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
