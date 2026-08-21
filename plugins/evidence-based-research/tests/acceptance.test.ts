import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const EXPECT_HELPERS = join(REPO, "scripts", "acceptance", "lib", "expect-helpers.sh");

test("research acceptance finds the matching seal receipt in workspace state", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "research-accept-receipt-"));
  const workspace = join(sandbox, "workspace");
  const output = join(sandbox, "out");
  const receiptDir = join(workspace, ".research", "state", "hook-events", "session");
  const manifest = join(workspace, "research.json");
  const runId = "r-20260821120000-acceptance";
  const seal = `sha256:${"a".repeat(64)}`;
  try {
    mkdirSync(receiptDir, { recursive: true });
    mkdirSync(output, { recursive: true });
    writeFileSync(manifest, `${JSON.stringify({ run_id: runId, integrity: { seal } })}\n`);
    writeFileSync(join(receiptDir, "receipt.json"), `${JSON.stringify({
      type: "receipt",
      payload: { tool: "research_seal", runId, seal },
    })}\n`);

    const result = spawnSync("bash", ["-c", `. "${EXPECT_HELPERS}"; require_research_seal_receipt "${manifest}"`], {
      encoding: "utf8",
      env: {
        ...process.env,
        ACCEPT_OUT: output,
        ACCEPT_WORKSPACE: workspace,
      },
    });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
