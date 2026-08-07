import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  MANAGED_END,
  MANAGED_START,
  inspectProjectInstructions,
  reconcileProjectInstructions,
  rollbackProjectInstructions,
  verifyProjectInstructions,
} from "../scripts/lib/project-instructions.mjs";

const roots = [];

function repository() {
  const root = mkdtempSync(join(tmpdir(), "project-instruction-guard-"));
  roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("creates canonical AGENTS.md and a relative CLAUDE.md symlink", () => {
  const root = repository();
  const before = inspectProjectInstructions(root);

  const result = reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });

  assert.equal(result.changed, true);
  assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /ai-experts:project-instructions:start/u);
  assert.equal(lstatSync(join(root, "CLAUDE.md")).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(root, "CLAUDE.md")), "AGENTS.md");
  assert.equal(verifyProjectInstructions({ workspace: root, decision: "changed", expectedRevisionId: result.revisionId }).ok, true);
});

test("preserves a large shared README outside the bounded managed block", () => {
  const root = repository();
  const original = `# Project\n\n${"x".repeat(70_000)}\n`;
  writeFileSync(join(root, "README.md"), original);
  symlinkSync("README.md", join(root, "AGENTS.md"));
  symlinkSync("README.md", join(root, "CLAUDE.md"));
  const before = inspectProjectInstructions(root);

  const result = reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });

  const updated = readFileSync(join(root, "README.md"), "utf8");
  assert.equal(updated.startsWith(original), true);
  assert.equal(readlinkSync(join(root, "AGENTS.md")), "README.md");
  assert.equal(result.state.instructionSource, "README.md");
});

test("migrates legacy CLAUDE.md rules without losing AGENTS.md content", () => {
  const root = repository();
  writeFileSync(join(root, "AGENTS.md"), "# Existing\n\nKeep this text.\n");
  writeFileSync(join(root, "CLAUDE.md"), "# Legacy\n\n- Run focused tests.\n");
  const before = inspectProjectInstructions(root);

  reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });

  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep this text\./u);
  assert.match(agents, /Run focused tests\./u);
  assert.equal(readlinkSync(join(root, "CLAUDE.md")), "AGENTS.md");
});

test("accepts candidate changes only inside the managed block", () => {
  const root = repository();
  writeFileSync(join(root, "AGENTS.md"), "# Rules\n\nKeep outside.\n");
  let state = inspectProjectInstructions(root);
  reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest });
  const current = readFileSync(join(root, "AGENTS.md"), "utf8");
  const candidatePath = join(root, "candidate.md");
  writeFileSync(candidatePath, current.replace(`${MANAGED_START}\n`, `${MANAGED_START}\n- Run the test suite.\n`));
  state = inspectProjectInstructions(root);

  reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest, candidateFile: candidatePath });
  assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /Run the test suite/u);

  const changedOutside = readFileSync(join(root, "AGENTS.md"), "utf8").replace("Keep outside.", "Changed outside.");
  writeFileSync(candidatePath, changedOutside);
  state = inspectProjectInstructions(root);
  assert.throws(
    () => reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest, candidateFile: candidatePath }),
    /outside the managed block/u,
  );
});

test("rejects stale CAS, managed secrets, BOM, and unresolved merge markers", () => {
  const root = repository();
  const stale = inspectProjectInstructions(root);
  writeFileSync(join(root, "AGENTS.md"), "# Changed\n");
  assert.throws(
    () => reconcileProjectInstructions({ workspace: root, expectedStateDigest: stale.stateDigest }),
    /state digest is stale/u,
  );

  let state = inspectProjectInstructions(root);
  const candidatePath = join(root, "candidate.md");
  writeFileSync(candidatePath, [
    "# Changed",
    "",
    MANAGED_START,
    "API_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    MANAGED_END,
    "",
  ].join("\n"));
  assert.throws(
    () => reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest, candidateFile: candidatePath }),
    /sensitive material/u,
  );

  writeFileSync(candidatePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`# X\n\n${MANAGED_START}\n${MANAGED_END}\n`)]));
  assert.throws(
    () => reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest, candidateFile: candidatePath }),
    /BOM/u,
  );

  writeFileSync(candidatePath, `# Changed\n\n${MANAGED_START}\n<<<<<<< ours\n=======\n>>>>>>> theirs\n${MANAGED_END}\n`);
  assert.throws(
    () => reconcileProjectInstructions({ workspace: root, expectedStateDigest: state.stateDigest, candidateFile: candidatePath }),
    /merge markers/u,
  );
});

test("refuses malformed markers and non-canonical symlinks", () => {
  const malformed = repository();
  writeFileSync(join(malformed, "AGENTS.md"), `${MANAGED_START}\n${MANAGED_START}\n${MANAGED_END}\n`);
  const malformedState = inspectProjectInstructions(malformed);
  assert.throws(
    () => reconcileProjectInstructions({ workspace: malformed, expectedStateDigest: malformedState.stateDigest }),
    /malformed/u,
  );

  const linked = repository();
  writeFileSync(join(linked, "README.md"), "# Project\n");
  symlinkSync("./README.md", join(linked, "AGENTS.md"));
  symlinkSync("./README.md", join(linked, "CLAUDE.md"));
  const linkedState = inspectProjectInstructions(linked);
  assert.equal(linkedState.valid, false);
  assert.throws(
    () => reconcileProjectInstructions({ workspace: linked, expectedStateDigest: linkedState.stateDigest }),
    /AGENTS\.md must be missing or a regular file/u,
  );
});

test("rolls back from a private revision and verifies rollback lineage", () => {
  const root = repository();
  const before = inspectProjectInstructions(root);
  const changed = reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });
  const current = inspectProjectInstructions(root);

  const rolledBack = rollbackProjectInstructions({
    workspace: root,
    expectedStateDigest: current.stateDigest,
    revisionId: changed.revisionId,
  });

  assert.equal(inspectProjectInstructions(root).agents.kind, "missing");
  const verification = verifyProjectInstructions({
    workspace: root,
    decision: "rollback",
    expectedRevisionId: rolledBack.revisionId,
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.parentRevisionId, changed.revisionId);
});

test("refuses an old revision after later project-authored instruction changes", () => {
  const root = repository();
  const before = inspectProjectInstructions(root);
  const changed = reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });
  writeFileSync(join(root, "AGENTS.md"), `${readFileSync(join(root, "AGENTS.md"), "utf8")}\nProject-authored later text.\n`);
  const current = inspectProjectInstructions(root);

  assert.throws(
    () => rollbackProjectInstructions({
      workspace: root,
      expectedStateDigest: current.stateDigest,
      revisionId: changed.revisionId,
    }),
    /not the current head/u,
  );
  assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /Project-authored later text/u);
});
