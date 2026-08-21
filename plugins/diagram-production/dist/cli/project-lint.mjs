#!/usr/bin/env node
// harness-source-hash: sha256:975768c4353cc33a5538c9391baadebe86ab9442322177133569c1c81b64ef8c
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "../chunks/chunk-MRMUGSK7.mjs";

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
