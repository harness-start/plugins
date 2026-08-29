import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUILTIN_RULES,
  formatFinding,
  loadUserConfig,
  matchRule,
  resolveRules,
  validateRule,
} from "../../../src/domains/commands/lib/rule-engine.js";
import { sanitizeCommand } from "../../../src/domains/commands/lib/sanitize-command.js";

test("resolveRules prepends user rules and merges engine settings", () => {
  const custom = {
    id: "no-force-push",
    match: /\bgit\s+push\b.*--force\b/iu,
    mode: "deny",
  };
  const { rules, settings } = resolveRules({
    rules: [custom],
    settings: {
      engines: { dangerousRm: false, denyEscalation: false },
      escalation: { windowMinutes: 999, threshold: 999 },
    },
  });

  assert.equal(rules[0].id, "no-force-push");
  assert.equal(rules[0].match, custom.match);
  assert.ok(rules.some((rule) => rule.id === "sed-inplace"));
  assert.equal(settings.engines.dangerousRm, true);
  assert.equal(settings.engines.denyEscalation, true);
  assert.equal(settings.engines.secretRead, true);
  assert.equal(settings.escalation.threshold, 3);
  assert.equal(settings.escalation.windowMinutes, 10);
});

test("matchRule: user allow overrides built-in redis deny", () => {
  const { rules } = resolveRules({
    rules: [
      {
        id: "allow-flushdb",
        match: /\bredis-cli\b[^\n]*\bFLUSHDB\b/iu,
        mode: "allow",
      },
    ],
  });
  const hit = matchRule("redis-cli FLUSHDB", rules);
  assert.equal(hit?.mode, "allow");
  assert.equal(hit?.id, "allow-flushdb");
});

test("matchRule: built-in sed and cat still classify correctly", () => {
  const { rules } = resolveRules(null);
  assert.equal(matchRule("sed -i 's/a/b/' src/a.txt", rules)?.id, "sed-inplace");
  assert.equal(
    matchRule("cat > src/a.txt <<'EOF'\nx\nEOF", rules)?.mode,
    "deny",
  );
  assert.equal(
    matchRule("cat > /tmp/a.sh <<'EOF'\necho ok\nEOF", rules)?.mode,
    "report",
  );
  assert.equal(matchRule("ls -la", rules), null);
});

test("matchRule ignores sed mention inside git commit messages", () => {
  const { rules } = resolveRules(null);
  assert.equal(
    matchRule("git commit -m 'document sed -i usage'", rules),
    null,
  );
});

test("matchRule evaluates a global user RegExp consistently across calls", () => {
  const { rules } = resolveRules({
    rules: [{ id: "global", match: /danger/gu, mode: "deny" }],
  });

  assert.equal(matchRule("danger", rules)?.id, "global");
  assert.equal(matchRule("danger", rules)?.id, "global");
});

test("matchRule evaluates a sticky user RegExp consistently across calls", () => {
  const { rules } = resolveRules({
    rules: [{ id: "sticky", match: /^danger$/yu, mode: "deny" }],
  });

  assert.equal(matchRule("danger", rules)?.id, "sticky");
  assert.equal(matchRule("danger", rules)?.id, "sticky");
});

test("sanitizeCommand strips commit message payloads", () => {
  const sanitized = sanitizeCommand("git commit -m 'document sed -i usage'");
  assert.equal(sanitized.includes("sed -i"), false);
});

test("validateRule rejects non-RegExp user matchers", () => {
  const previous = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.equal(validateRule({ match: "not-a-regex", mode: "deny" }, 0), false);
    assert.equal(validateRule({ match: /ok/, mode: "block" }, 1), false);
    assert.equal(validateRule({ match: /ok/, mode: "allow" }, 2), true);
  } finally {
    process.stderr.write = previous;
  }
});

test("resolveRules drops invalid user rules without dropping built-ins", () => {
  const previous = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const { rules } = resolveRules({
      rules: [{ match: "bad" }, { match: /force/, mode: "deny", id: "ok" }],
    });
    assert.equal(rules[0].id, "ok");
    assert.ok(rules.length > BUILTIN_RULES.length - 1);
  } finally {
    process.stderr.write = previous;
  }
});

test("formatFinding includes blockingContract on deny", () => {
  const message = formatFinding(
    {
      id: "custom",
      title: "Custom Guard",
      mode: "deny",
      reason: "demo",
      recovery: "fix it",
    },
    "echo demo",
  );
  for (const field of [
    "blockingContract",
    "observedFacts",
    "harm",
    "unblockWhen",
    "recovery",
  ]) {
    assert.match(message, new RegExp(field));
  }
  assert.match(message, /Custom Guard/);
});

test("loadUserConfig imports project config file", async () => {
  const root = mkdtempSync(join(tmpdir(), "cmd-safety-cfg-"));
  try {
    writeFileSync(
      join(root, ".command-safety.mjs"),
      `export default { rules: [{ id: "from-file", match: /hello/, mode: "report" }] };\n`,
    );
    const config = await loadUserConfig(root);
    assert.equal(config.rules[0].id, "from-file");
    const { rules } = resolveRules(config);
    assert.equal(matchRule("hello world", rules)?.id, "from-file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadUserConfig returns null when missing", async () => {
  const root = mkdtempSync(join(tmpdir(), "cmd-safety-empty-"));
  try {
    assert.equal(await loadUserConfig(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Keep import path reachable for static analysis of package layout.
void pathToFileURL;
