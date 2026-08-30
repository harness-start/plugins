#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "./chunk-6OZN2WKX.mjs";
import "./chunk-PAM3R2KB.mjs";
import "./chunk-QTVEXSL5.mjs";

// plugins/artifact-production/src/domains/diagram/entries/cli/project-lint.ts
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
await main().catch((error) => {
  process.stderr.write(`[diagram-project-lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
