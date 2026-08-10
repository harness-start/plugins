import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { appendEvent, journalLocation } from "../scripts/lib/journal.mjs";

const QUERY = fileURLToPath(new URL("../scripts/compact-context-journal-query.mjs", import.meta.url));

test("query validates the chain and exposes bounded U-to-P retrieval without trusting Markdown headings", () => {
  const root = mkdtempSync(join(tmpdir(), "compact-query-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const location = journalLocation({ cwd: root, host: "codex", sessionId: "query-session" });
    appendEvent(location, { type: "prompt", prefix: "P", title: "UNCONFIRMED", raw: "old raw requirement" });
    appendEvent(location, { type: "admission", prefix: "U", title: "Admitted", raw: "Admitted prompt: P000001" });
    appendEvent(location, { type: "boundary", prefix: "B", title: "clear", raw: "boundary" });
    appendEvent(location, { type: "prompt", prefix: "P", title: "UNCONFIRMED", raw: "active raw requirement" });
    appendEvent(location, { type: "admission", prefix: "U", title: "Admitted", raw: "Admitted prompt: P000004" });

    const index = spawnSync(process.execPath, [QUERY, "index", "--journal", location.path, "--session-id", location.sessionId], { encoding: "utf8" });
    assert.equal(index.status, 0, index.stderr);
    assert.match(index.stdout, /Integrity: verified/u);
    assert.match(index.stdout, /U000005 -> P000004/u);
    assert.doesNotMatch(index.stdout, /U000002|old raw requirement/u);
    assert.doesNotMatch(index.stdout, /active raw requirement/u);

    const exact = spawnSync(process.execPath, [QUERY, "event", "P000004", "--journal", location.path, "--session-id", location.sessionId], { encoding: "utf8" });
    assert.equal(exact.status, 0, exact.stderr);
    assert.match(exact.stdout, /active raw requirement/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
