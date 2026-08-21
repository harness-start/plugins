#!/usr/bin/env node
// harness-source-hash: sha256:cafc8a70a5c6e53a6b3fdd264e889af9ee073b12efe2533e339d952816910a88
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "../chunks/chunk-KM6KTTP3.mjs";

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
