import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(ROOT, "dist", "hooks", "engineering-mindset.mjs");

function run(input: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [ENTRY], {
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("SessionStart publishes a bounded, selective skill routing contract", () => {
  const result = run(JSON.stringify({ session_id: "session", cwd: ROOT }));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const context = output.hookSpecificOutput.additionalContext;

  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.ok(Buffer.byteLength(context, "utf8") <= 2400);
  assert.match(context, /mandatory pre-action gate/iu);
  assert.match(context, /host-native Skill invocation|read.*SKILL\.md/isu);
  assert.match(context, /non-trivial.*karpathy-guidelines/isu);
  assert.match(context, /bug.*systematic-debugging/isu);
  assert.match(context, /completion.*verification-before-completion/isu);
  assert.match(context, /explicitly asks.*caveman/isu);
  assert.match(context, /English prose.*humanizer.*stop-slop/isu);
  assert.match(context, /Chinese prose.*humanizer-zh.*shuorenhua.*ai-flavor-remover/isu);
  assert.match(context, /Markdown.*remove-ai-style.*analyzer/isu);
  assert.match(context, /mixed-language.*both language stacks/isu);
  assert.match(context, /code.*commands.*machine-readable/isu);
  assert.match(context, /smallest relevant set/iu);
  assert.match(context, /never claim.*missing/isu);
  assert.doesNotMatch(context, /\btriage\b/iu);
});

test("SessionStart fails open on malformed input", () => {
  const result = run("not-json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /engineering-mindset.*invalid hook input/iu);
});

test("Codex receives an explicit installed Skill file loading contract", () => {
  const result = run(
    JSON.stringify({ session_id: "codex-session", cwd: ROOT }),
    { HARNESS_HOST: "codex" },
  );
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(Buffer.byteLength(context, "utf8") <= 2400);
  assert.match(context, /Codex.*\$HOME\/\.agents\/skills\/<name>\/SKILL\.md/isu);
  assert.match(context, /first matching engineering action/iu);
  assert.match(
    context,
    /after the last change and before the final response.*verification-before-completion/isu,
  );
});

test("README states the advisory boundary and dependency installation path", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, /advisory|提示/iu);
  assert.match(readme, /skill-deps\.json/iu);
  assert.match(readme, /install-all\.sh/iu);
  assert.match(readme, /does not guarantee|不保证/iu);
  assert.match(readme, /humanizer.*stop-slop/isu);
  assert.match(readme, /humanizer-zh.*shuorenhua.*ai-flavor-remover/isu);
  assert.match(readme, /remove-ai-style/iu);
});
