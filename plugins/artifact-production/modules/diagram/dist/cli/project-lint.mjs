#!/usr/bin/env node
// harness-source-hash: sha256:0625411026998a4e94470ef1c127977acd81f7b3490fd609ed6a61e3a57f5c1e
import {
  assertDiagramProjectRoot,
  loadDiagramProject,
  validateDiagramModel
} from "../chunks/chunk-6V4MDNXG.mjs";

// plugins/artifact-production/modules/diagram/src/entries/cli/project-lint.ts
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
