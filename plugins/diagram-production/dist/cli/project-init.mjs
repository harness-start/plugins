#!/usr/bin/env node
// harness-source-hash: sha256:11489f6cdf6f0dbafbc48058596c84f56a2e943da337b6d5ea09ff7895b66c29
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-ZXSWDE54.mjs";
import {
  DESIGN_SYSTEM_SCHEMA,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  SOURCE_SCHEMA,
  assertDiagramProjectRoot,
  atomicWrite,
  withWriterJournal
} from "../chunks/chunk-436EDDQR.mjs";

// plugins/diagram-production/src/entries/cli/project-init.ts
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
function runNpm(root) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 18e4);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`NPM_UNAVAILABLE:${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`NPM_INSTALL_FAILED:${stderr.trim()}`));
    });
  });
}
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2], { allowMissing: true });
  const grant = await consumeWriterCapability({ root, capability: "diagram-init", argv: processWriterArgv() });
  const artifactId = basename(root);
  await mkdir(join(root, "src"), { recursive: true });
  await withWriterJournal(root, "diagram-init", async () => {
    const packageJson = { name: `diagram-${artifactId}`, private: true, type: "module", dependencies: { "@fontsource/noto-sans-sc": "5.3.0", "@fontsource/noto-serif-sc": "5.3.0", "@resvg/resvg-js": "2.6.2", elkjs: "0.12.0" } };
    const files = {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": `${JSON.stringify(packageJson, null, 2)}
`,
      "plan.contract.json": `${JSON.stringify({ schema: PLAN_SCHEMA, artifactId, targetStage: "source", audience: "general", objective: "explain a system relationship", language: "zh-CN", assumptions: [] }, null, 2)}
`,
      "design.system.json": `${JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, canvas: { width: 1600, height: 900, background: "#F8FAFC" }, colors: { primary: "#2563EB", accent: "#0F766E", text: "#0F172A", muted: "#475569", surface: "#FFFFFF", line: "#94A3B8" }, typography: { sans: "Noto Sans SC", serif: "Noto Serif SC", basePx: 20 }, spacing: { gridPx: 4, nodeGapPx: 48, layerGapPx: 88 } }, null, 2)}
`,
      "diagram.project.json": `${JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, source: "src/diagram.json", designSystem: "design.system.json", outputs: ["svg", "png", "html", "drawio"] }, null, 2)}
`,
      "src/diagram.json": `${JSON.stringify({ schema: SOURCE_SCHEMA, type: "flowchart", title: artifactId.replaceAll("-", " "), nodes: [{ id: "input", label: "Input" }, { id: "process", label: "Process" }, { id: "output", label: "Output" }], edges: [{ from: "input", to: "process" }, { from: "process", to: "output" }] }, null, 2)}
`
    };
    for (const [path, content] of Object.entries(files)) await atomicWrite(root, path, content);
    await runNpm(root);
  }, grant);
  process.stdout.write(`${JSON.stringify({ artifactId, root })}
`);
}
main().catch((error) => {
  process.stderr.write(`[diagram-project-init] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
