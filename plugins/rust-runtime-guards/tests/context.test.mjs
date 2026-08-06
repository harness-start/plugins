import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext } from "../scripts/checks/runtime-context.mjs";
import { collectDebtFindings } from "../scripts/checks/debt.mjs";

test("Rust context and debug guard cover source inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "rust-context-"));
  try {
    writeFileSync(join(root, "Cargo.toml"), '[package]\nname = "agent"\nedition = "2024"\n');
    assert.match(environmentContext({ cwd: root }), /edition: 2024/u);
    const source = join(root, "main.rs"), content = "fn main() { dbg!(42); }\n"; writeFileSync(source, content);
    assert.ok(collectDebtFindings({ file_path: source, content }, source).some((item) => item.label.includes("dbg!")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
