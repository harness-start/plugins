import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { frontendEnvironment, stylelintPrimer } from "../scripts/checks/environment.mjs";
import { fileReports } from "../scripts/checks/file-checks.mjs";
import { additionalContextOutput } from "../scripts/lib/hook-io.mjs";

const root = new URL("..", import.meta.url).pathname;

test("Codex PostToolUse feedback preserves context while replacing the completed tool result", () => {
  const previous = process.env.PLUGIN_ROOT;
  process.env.PLUGIN_ROOT = root;
  try {
    assert.equal(additionalContextOutput("PostToolUse", "review this"), null);
    assert.equal(process.exitCode, 2);
  } finally {
    process.exitCode = 0;
    if (previous === undefined) delete process.env.PLUGIN_ROOT;
    else process.env.PLUGIN_ROOT = previous;
  }
});

function run(script, payload, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts", script)], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(JSON.stringify(payload));
  });
}

test("post entry reports invalid mini-program app config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "app.json");
    await writeFile(file, '{"pages":[]}\n');
    const result = await run("web-hook-post-tool.mjs", { cwd, tool_name: "Edit", tool_input: { file_path: file } }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /WeChat Mini Program Config/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("post entry extracts targets from direct apply_patch payloads", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "app.json");
    await writeFile(file, '{"pages":[]}\n');
    const result = await run("web-hook-post-tool.mjs", {
      cwd,
      tool_name: "apply_patch",
      tool_input: { patch: "*** Begin Patch\n*** Add File: app.json\n+{\"pages\":[]}\n*** End Patch" },
    }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /WeChat Mini Program Config/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("post entry extracts targets from shell redirects", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "app.json");
    await writeFile(file, '{"pages":[]}\n');
    const result = await run("web-hook-post-tool.mjs", {
      cwd,
      tool_name: "exec_command",
      tool_input: { cmd: "printf '%s\\n' '{\"pages\":[]}' > app.json" },
    }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /WeChat Mini Program Config/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("prompt entry reports actual frontend dependencies", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5.0", vite: "^7.0.0" } }));
    const result = await run("web-hook-user-prompt.mjs", { cwd, prompt: "inspect" }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Vue/u);
    assert.match(result.stdout, /Vite/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("clean non-frontend file exits without output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "notes.txt");
    await writeFile(file, "hello\n");
    const result = await run("web-hook-post-tool.mjs", { cwd, tool_name: "Edit", tool_input: { file_path: file } }, cwd);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("frontend-encoding-guard and WXML/WXSS/Taro syntax hooks retain source behavior", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const encoded = join(cwd, "view.vue");
    const wxml = join(cwd, "page.wxml");
    const wxss = join(cwd, "page.wxss");
    const taro = join(cwd, "page.tsx");
    await writeFile(encoded, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("<template />\n")]));
    await writeFile(wxml, "<view>{{ value }</view>\n");
    await writeFile(wxss, ".page { color：red;\n");
    await writeFile(taro, "import Taro from '@tarojs/taro';\ndocument.querySelector('.x');\n");
    assert.match(fileReports(encoded).join("\n"), /Frontend Encoding Guard/u);
    assert.match(fileReports(wxml).join("\n"), /WXML/u);
    assert.match(fileReports(wxss).join("\n"), /WXSS/u);
    assert.match(fileReports(taro).join("\n"), /Taro\/MiniProgram/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("frontend-validation-debt-guard reports only net-new validation debt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  try {
    const file = join(cwd, "Form.tsx");
    await writeFile(file, "export const Form = () => <button disabled={saving} onClick={() => alert('invalid')}>Save</button>;\n");
    const reports = fileReports(file, { old_string: "export const Form = () => <button>Save</button>;", new_string: "export const Form = () => <button disabled={saving} onClick={() => alert('invalid')}>Save</button>;" }).join("\n");
    assert.match(reports, /alert-only validation/u);
    assert.match(reports, /disabled submit without pending state/u);
    assert.doesNotMatch(fileReports(file, { old_string: "alert('invalid')", new_string: "alert('invalid')" }).join("\n"), /Frontend Validation Debt Guard/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("vue-syntax and svelte-syntax use an already available PATH checker", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-guards-"));
  const previousPath = process.env.PATH;
  try {
    const bin = join(cwd, "bin");
    await mkdir(bin);
    for (const name of ["vue-tsc", "svelte-check"]) {
      const executable = join(bin, name);
      await writeFile(executable, `#!/bin/sh\necho ${name}-failure >&2\nexit 1\n`);
      await chmod(executable, 0o755);
    }
    process.env.PATH = `${bin}:${previousPath ?? ""}`;
    const vue = join(cwd, "View.vue");
    const svelte = join(cwd, "View.svelte");
    await writeFile(vue, "<template />\n");
    await writeFile(svelte, "<p>ok</p>\n");
    assert.match(fileReports(vue).join("\n"), /vue-tsc-failure/u);
    assert.match(fileReports(svelte).join("\n"), /svelte-check-failure/u);
  } finally {
    process.env.PATH = previousPath;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("frontend env detectors and stylelint-coverage-primer report only observed project facts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-env-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "19", next: "15", vue: "3", svelte: "5", "@tarojs/taro": "4", tailwindcss: "4" } }));
    const environment = frontendEnvironment(cwd);
    for (const label of ["React 19", "Next.js 15", "Vue 3", "Svelte 5", "Taro 4", "Tailwind CSS 4"]) assert.match(environment, new RegExp(label.replace(".", "\\."), "u"));
    assert.match(stylelintPrimer(cwd), /Stylelint Coverage/u);
    await writeFile(join(cwd, ".stylelintrc.json"), "{}\n");
    assert.equal(stylelintPrimer(cwd), null);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("frontend-creative-env-detector recognizes Godot without package metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "godot-env-"));
  try {
    await writeFile(join(cwd, "project.godot"), "config_version=5\n");
    assert.match(frontendEnvironment(cwd), /Godot 4\.x/u);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
