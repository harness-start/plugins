#!/usr/bin/env node
// harness-source-hash: sha256:11489f6cdf6f0dbafbc48058596c84f56a2e943da337b6d5ea09ff7895b66c29
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "../chunks/chunk-436EDDQR.mjs";

// plugins/diagram-production/src/entries/cli/project-lint.ts
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]);
  const findings = validateDiagramModel(await loadDiagramProject(root), { stage: "source" });
  if (findings.length) {
    process.stderr.write(`${findings.map(({ code, path, message }) => `${path} [${code}] ${message}`).join("\n")}
`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${JSON.stringify({ verdict: "pass" })}
`);
}
main().catch((error) => {
  process.stderr.write(`[diagram-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
