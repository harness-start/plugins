import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(new URL("../../../src/entries/cli/harness.ts", import.meta.url), "utf8");
const entry = new URL("../../../dist/cli/harness.mjs", import.meta.url);

test("owner CLI registers its in-process commands", () => {
  assert.match(source, /runOwnerCli/u);
  assert.match(source, /debugging:\s*runDebugCommand/u);
  assert.match(source, /specification:\s*runSpecificationCommand/u);
});

test("bundled owner CLI executes exactly one debug route in a non-git directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "engineering-owner-cli-"));
  const result = spawnSync(process.execPath, [entry.pathname,
    "debug", "init",
    "--cwd", cwd,
    "--slug", "single-route",
    "--summary", "public CLI executes one route",
    "--user-outcome", "the public command returns one successful result",
    "--expected", "the command succeeds",
    "--actual", "multiple private commands execute",
    "--repro", "node --test test/repro.test.mjs",
    "--acceptance", "node --test test/acceptance.test.mjs",
    "--environment", "isolated non-git directory",
  ], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 1, result.stdout);
  assert.equal(JSON.parse(lines[0]).ok, true);
});

test("debug claim --help is side-effect free through the bundled owner CLI", () => {
  const cwd = mkdtempSync(join(tmpdir(), "engineering-owner-help-"));
  const opened = spawnSync(process.execPath, [entry.pathname,
    "debug", "init",
    "--cwd", cwd,
    "--slug", "help",
    "--summary", "help must not mutate",
    "--user-outcome", "help only prints usage",
    "--expected", "no event is appended",
    "--actual", "claim event is appended",
    "--repro", "node --test test/repro.test.mjs",
    "--acceptance", "node --test test/acceptance.test.mjs",
    "--environment", "isolated non-git directory",
  ], { cwd, encoding: "utf8" });
  assert.equal(opened.status, 0, opened.stderr);
  const events = join(cwd, ".debug-workflow", "help", "events.jsonl");
  const before = readFileSync(events, "utf8");

  const help = spawnSync(process.execPath, [entry.pathname, "debug", "claim", "--cwd", cwd, "--help"], {
    cwd,
    encoding: "utf8",
  });

  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /Usage: harness debug claim/u);
  assert.equal(readFileSync(events, "utf8"), before);
});
