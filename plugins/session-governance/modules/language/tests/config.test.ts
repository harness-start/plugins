import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveConfig,
  userConfigPath,
} from "../src/lib/config.js";

test("empty configuration resolves to the strict Chinese defaults", () => {
  assert.deepEqual(resolveConfig({}), {
    ...DEFAULT_CONFIG,
    detection: { ...DEFAULT_CONFIG.detection },
  });
});

test("configuration selects a profile, surface modes, and bounded thresholds", () => {
  assert.deepEqual(resolveConfig({
    defaultProfile: "th-TH",
    toolFeedback: "off",
    stop: "off",
    detection: { minScriptCharacters: 20, minLetterRatio: 0.5 },
  }), {
    defaultProfile: "th-TH",
    toolFeedback: "off",
    stop: "off",
    detection: { minScriptCharacters: 20, minLetterRatio: 0.5 },
  });
});

for (const source of [
  { defaultProfile: "fr-FR" },
  { toolFeedback: "block" },
  { stop: "report" },
  { detection: { minScriptCharacters: 0 } },
  { detection: { minLetterRatio: 2 } },
  { callback: () => true },
]) {
  test(`invalid configuration fails closed: ${Object.keys(source)[0]}`, () => {
    assert.throws(() => resolveConfig(source));
  });
}

test("host-scoped user profile loads below the project override", async () => {
  const root = mkdtempSync(join(tmpdir(), "language-config-project-"));
  const codexHome = mkdtempSync(join(tmpdir(), "language-config-codex-"));
  const oldHost = process.env.HARNESS_HOST;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    process.env.HARNESS_HOST = "codex";
    process.env.CODEX_HOME = codexHome;
    const path = userConfigPath();
    assert.equal(path, join(codexHome, "harness-start", "language-output.json"));
    mkdirSync(join(codexHome, "harness-start"), { recursive: true });
    writeFileSync(path, '{"defaultProfile":"en-US"}\n');

    assert.equal((await loadConfig(root)).config.defaultProfile, "en-US");

    writeFileSync(
      join(root, ".language-output.mjs"),
      'export default { defaultProfile: "ja-JP" };\n',
    );
    assert.equal((await loadConfig(root)).config.defaultProfile, "ja-JP");
  } finally {
    if (oldHost === undefined) delete process.env.HARNESS_HOST;
    else process.env.HARNESS_HOST = oldHost;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    rmSync(root, { recursive: true, force: true });
    rmSync(codexHome, { recursive: true, force: true });
  }
});
