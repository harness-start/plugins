import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext, eslintReport } from "../scripts/checks/runtime-context.mjs";

test("environment context consolidates TypeScript and NestJS facts", () => {
  const root = mkdtempSync(join(tmpdir(), "ts-context-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "11", "@prisma/client": "6" }, devDependencies: { typescript: "5" } }));
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022" } }));
    const context = environmentContext({ cwd: root });
    assert.match(context, /NestJS 11/u);
    assert.match(context, /strict=true/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ESLint report uses only an installed project-local executable", async () => {
  const root = mkdtempSync(join(tmpdir(), "ts-eslint-"));
  try {
    const bin = join(root, "node_modules", "eslint", "bin"); mkdirSync(bin, { recursive: true });
    writeFileSync(join(root, "eslint.config.mjs"), "export default []\n");
    writeFileSync(join(bin, "eslint.js"), "process.stderr.write('parser failure'); process.exit(1)\n");
    const target = join(root, "app.ts"); writeFileSync(target, "export {}\n");
    assert.match(await eslintReport(target), /parser failure/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
