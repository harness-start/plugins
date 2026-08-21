#!/usr/bin/env node
// harness-source-hash: sha256:e8cc40fcfe5349972dfeb32048b1a7a0b55f23fb89184c448bf03d2bddb4c2d7
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "../chunks/chunk-UIOPM3FT.mjs";

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
