import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { collectEvidenceBundle, type CommandRunner } from "../src/lib/work-evidence.js";
import { buildReportWindow } from "../src/lib/transcript-scan.js";

test("collectEvidenceBundle deduplicates transcript and explicit repositories and attributes only matching authors", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-evidence-"));
  const repoA = join(home, "a");
  const repoB = join(home, "b");
  mkdirSync(join(repoA, "nested"), { recursive: true });
  mkdirSync(repoB, { recursive: true });
  const calls: Array<{ command: string; args: string[] }> = [];
  const run: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    const repo = args[1];
    if (args.includes("rev-parse")) return { code: 0, stdout: `${repo === join(repoA, "nested") ? repoA : repo}\n`, stderr: "" };
    if (args.includes("user.name")) return { code: 0, stdout: "Alice\n", stderr: "" };
    if (args.includes("user.email")) return { code: 0, stdout: "alice@example.test\n", stderr: "" };
    if (args.includes("log")) {
      const author = repo === repoB ? "Mallory\u001fmallory@example.test" : "Alice\u001falice@example.test";
      return { code: 0, stdout: `abc123\u001f2026-08-10T10:00:00Z\u001f${author}\u001fFinish feature\n`, stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "unsupported" };
  };
  try {
    const bundle = await collectEvidenceBundle({
      window: buildReportWindow({ kind: "daily", date: "2026-08-10" }),
      sessions: [{ cwd: join(repoA, "nested") }, { cwd: repoA }],
      repos: [repoB],
      skipRemote: true,
      home,
      run,
    });
    assert.equal(bundle.schema, "EvidenceBundleV2");
    assert.equal(bundle.sources.git.repositories, 2);
    assert.equal(bundle.records.filter((record) => record.type === "git-commit").length, 2);
    assert.deepEqual(bundle.records.map((record) => record.ownership).sort(), ["attributed", "unverified"]);
    assert.equal(calls.some((call) => call.command === "git" && call.args[0] === "-C"), true);
    assert.doesNotMatch(JSON.stringify(bundle), new RegExp(home.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("collectEvidenceBundle treats missing or unauthenticated forge CLIs as data gaps without login", async () => {
  const calls: string[] = [];
  const run: CommandRunner = async (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args.includes("rev-parse")) return { code: 0, stdout: "/repo\n", stderr: "" };
    if (command === "git" && args.includes("user.name")) return { code: 0, stdout: "A\n", stderr: "" };
    if (command === "git" && args.includes("user.email")) return { code: 0, stdout: "a@example.test\n", stderr: "" };
    if (command === "git" && args.includes("log")) return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args.includes("remote.origin.url")) return { code: 0, stdout: "https://github.com/acme/repo.git\n", stderr: "" };
    if (command === "gh" && args[0] === "--version") return { code: 0, stdout: "gh version\n", stderr: "" };
    if (command === "gh" && args[0] === "auth") return { code: 1, stdout: "", stderr: "not logged in" };
    return { code: 127, stdout: "", stderr: "missing" };
  };
  const bundle = await collectEvidenceBundle({
    window: buildReportWindow({ kind: "daily", date: "2026-08-10" }),
    sessions: [{ cwd: "/repo" }],
    run,
  });
  assert.equal(bundle.dataGaps.some((gap) => /gh.*authenticated/iu.test(gap)), true);
  assert.equal(calls.some((call) => /auth login|glab auth login/u.test(call)), false);
});

test("skipGit and skipRemote are real opt-outs", async () => {
  let called = false;
  const bundle = await collectEvidenceBundle({
    window: buildReportWindow({ kind: "daily", date: "2026-08-10" }),
    sessions: [{ cwd: "/repo" }],
    skipGit: true,
    skipRemote: true,
    run: async () => { called = true; return { code: 0, stdout: "", stderr: "" }; },
  });
  assert.equal(called, false);
  assert.equal(bundle.sources.git.status, "skipped");
  assert.equal(bundle.sources.remote.status, "skipped");
});
