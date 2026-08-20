import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../dist/hooks/engineering-practice.mjs");

function run(mode: "session-start" | "user-prompt", event: Record<string, unknown>) {
  return spawnSync(process.execPath, [entry, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
  });
}

function withGitRepo(files: Record<string, string>, runInRepo: (root: string) => void): void {
  const root = mkdtempSync(resolve(tmpdir(), "engineering-practice-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(resolve(root, path, ".."), { recursive: true });
      writeFileSync(resolve(root, path), content);
    }
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "baseline"], { cwd: root });
    runInRepo(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("offers engineering methods without making Skill loading an outcome prerequisite", () => {
  const result = spawnSync(process.execPath, [entry], { input: JSON.stringify({ cwd: process.cwd() }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review.*engineering-verification/isu);
  assert.match(context, /optional.*not.*(?:prerequisite|completion evidence)/isu);
  assert.match(context, /fresh command evidence/iu);
  assert.match(context, /value.*type.*container.*shape.*cardinality.*order.*stability.*warning.*error.*public API/isu);
  assert.match(context, /single example.*not.*complete/isu);
  assert.match(context, /local.*callers.*tests.*documentation.*history/isu);
  assert.match(context, /hidden evaluator.*solution patch/isu);
  assert.match(context, /compatibility.*accepted call forms.*not.*incidental.*container/isu);
  assert.match(context, /P0-P3 severity.*exact file:line.*concrete evidence.*verifiable fix/isu);
  assert.doesNotMatch(context, /first lossy transform|two completely disjoint chains/iu);
  assert.doesNotMatch(context, /before acting|\brequire\b/iu);
  assert.doesNotMatch(context, /engineering-debugging|debug-workflow|humanizer|stop-slop|shuorenhua|\$HOME\/\.agents\/skills/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("routes boundary prompts to a short counterexample contract", () => {
  const result = run("user-prompt", {
    prompt: "Fix a tensor conversion that rejects zero-length component arrays after broadcasting.",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /current (?:exception|rejection).*not.*compatibility proof/isu);
  assert.match(output.additionalContext, /all-empty.*mixed empty.*populated.*ordinary populated/isu);
  assert.match(output.additionalContext, /first lossy.*before.*distinction/isu);
  assert.match(output.additionalContext, /unequal cardinalit.*zero.*singleton/isu);
  assert.match(output.additionalContext, /each output component.*corresponding input.*value.*shape/isu);
  assert.match(output.additionalContext, /do not synthesize.*shared empty.*aggregate.*split/isu);
  assert.doesNotMatch(output.additionalContext, /Repository:|Instance ID:|Base commit:/iu);
  assert.doesNotMatch(output.additionalContext, /stable-order challenge/iu);
});

test("routes ordering prompts to repository-native stable-order challenges", () => {
  const result = run("user-prompt", {
    prompt: "Repair dependency ordering when several independent chains are merged.",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /repository.*search.*stable.*primitive/isu);
  assert.match(output.additionalContext, /two independent chains.*at least two items/isu);
  assert.match(output.additionalContext, /stable.*frontier.*a1.*b1.*a2.*b2.*not.*a1.*a2.*b1.*b2/isu);
  assert.match(output.additionalContext, /named.*seam.*zero.*one.*two.*many/isu);
  assert.match(output.additionalContext, /single-input side branch.*own deduplication.*incidental input container.*audit every aggregate caller.*sibling consumers/isu);
  assert.match(output.additionalContext, /adjacent duplicate.*same chain.*self-dependency.*cycle/isu);
  assert.match(output.additionalContext, /genuine cycle.*every distinct item.*every caller group.*unique.*later groups.*exact diagnostic/isu);
  assert.doesNotMatch(output.additionalContext, /Repository:|Instance ID:|Base commit:/iu);
});

test("challenges disputed diagnostics at the caller-visible abstraction level", () => {
  const result = run("user-prompt", {
    prompt: "Fix dependency merging; the warning message seems wrong because it names arbitrary internal nodes.",
  });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /request disputes.*diagnostic/isu);
  assert.match(context, /original caller-supplied constraint groups/isu);
  assert.match(context, /complete original input sequences/isu);
  assert.match(context, /not.*elements extracted from them/isu);
  assert.match(context, /not.*arbitrary internal.*nodes/isu);
  assert.match(context, /preserve each collection boundary.*do not flatten.*member text/isu);
  assert.match(context, /one grammatical summary.*project-conventional delimiters/isu);
  assert.match(context, /do not retain.*internal-node.*one-item-per-line/isu);
  assert.match(context, /exact.*type.*text/isu);
});

test("generic workflow wording does not misroute a boundary prompt to ordering", () => {
  const result = run("user-prompt", {
    prompt: "Before editing production code, fix empty component arrays after broadcasting.",
  });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /boundary challenge/iu);
  assert.doesNotMatch(context, /stable-order challenge/iu);
});

test("Stop blocks a new empty guard placed after a lossy transform", () => {
  withGitRepo({
    "src/coordinates.py": [
      "def convert(parts):",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    return engine(matrix)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/coordinates.py"), [
      "def convert(parts):",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    if matrix.size == 0:",
      "        return empty_result(matrix.shape)",
      "    return engine(matrix)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /src\/coordinates\.py:\d+.*after lossy transform broadcast_components/isu);
  });
});

test("Stop blocks a newly invented rejection for mixed boundary inputs", () => {
  withGitRepo({
    "src/coordinates.py": [
      "def convert(parts):",
      "    parts = broadcast_components(*parts)",
      "    return engine(parts)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/coordinates.py"), [
      "def convert(parts):",
      "    empty = [part.size == 0 for part in parts]",
      "    if any(empty) and not all(empty):",
      "        raise ValueError('components cannot be combined')",
      "    parts = broadcast_components(*parts)",
      "    return engine(parts)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /new exception is not preservation evidence.*public-seam unequal-cardinality test/isu);
  });
});

test("Stop blocks a shared empty aggregate synthesized from mixed components", () => {
  withGitRepo({
    "src/coordinates.py": [
      "def convert(parts):",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    output = engine(matrix)",
      "    return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/coordinates.py"), [
      "def convert(parts):",
      "    has_empty_component = any(part.size == 0 for part in parts)",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    if has_empty_component:",
      "        output = zeros((0, dimensions))",
      "    else:",
      "        output = engine(matrix)",
      "    return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /shared empty aggregate output.*erases caller components/isu);
  });
});

test("Stop blocks fresh per-component empties synthesized after lossy alignment", () => {
  withGitRepo({
    "src/coordinates.py": [
      "def convert(parts):",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    return engine(matrix)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/coordinates.py"), [
      "def convert(parts):",
      "    if all(part.size == 0 for part in parts):",
      "        return [array([]) for _ in parts]",
      "    parts = broadcast_components(*parts)",
      "    matrix = stack(parts)",
      "    if matrix.size == 0:",
      "        return [array([]) for _ in parts]",
      "    return engine(matrix)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /fresh empty components.*after lossy transform.*preserve.*original caller components/isu);
  });
});

test("Stop blocks a raw one-input bypass in a new variadic seam", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def combine(left, right):",
      "        return stable_order(left + right)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def combine(*chains):",
      "        if len(chains) == 1:",
      "            return chains[0]",
      "        return stable_order(chains)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /returns chains\[0\] unchanged.*shared normalization contract/isu);
  });
});

test("Stop blocks a raw one-input bypass moved into a variadic seam caller", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def render(self):",
      "        return self.combine(*self._chains)",
      "",
      "    def combine(left, right):",
      "        return stable_order(left + right)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def render(self):",
      "        if len(self._chains) == 1:",
      "            return self._chains[0]",
      "        return self.combine(*self._chains)",
      "",
      "    def combine(*chains):",
      "        return stable_order(chains)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /returns self\._chains\[0\] unchanged.*shared normalization contract/isu);
  });
});

test("Stop blocks a variadic diagnostic that reports extracted internal elements", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def combine(left, right):",
      "        return stable_order(left + right)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def combine(*chains):",
      "        try:",
      "            return stable_order(chains)",
      "        except DependencyCycleError:",
      "            conflict = (previous, item)",
      "            warnings.warn('Conflicting chains: %s' % conflict)",
      "            return fallback(chains)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /formats extracted variable conflict.*complete caller-supplied input sequences/isu);
  });
});

test("Stop blocks a variadic migration that leaves a sibling aggregate consumer pairwise", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def primary(self):",
      "        result = self._chains[0]",
      "        for chain in self._chains[1:]:",
      "            result = self.combine(result, chain)",
      "        return result",
      "",
      "    def secondary(self):",
      "        result = self._fallback_chains[0]",
      "        for chain in self._fallback_chains[1:]:",
      "            result = self.combine(result, chain)",
      "        return result",
      "",
      "    def combine(left, right):",
      "        return pairwise_order(left, right)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def primary(self):",
      "        return self.combine(*self._chains)",
      "",
      "    def secondary(self):",
      "        result = self._fallback_chains[0]",
      "        for chain in self._fallback_chains[1:]:",
      "            result = self.combine(result, chain)",
      "        return result",
      "",
      "    def combine(*chains):",
      "        return stable_order(chains)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /sibling aggregate consumer.*pairwise.*variadic public seam combine/isu);
  });
});

test("Stop blocks lossy cycle fallback and flattened caller-group diagnostics", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def combine(left, right):",
      "        return stable_order(left + right)",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def combine(*chains):",
      "        try:",
      "            return stable_order(chains)",
      "        except DependencyCycleError:",
      "            warnings.warn('Conflicting chains:\\n%s' % '\\n'.join(",
      "                ', '.join(str(item) for item in chain) for chain in chains",
      "            ))",
      "            return list(chains[0])",
      "",
    ].join("\n"));
    const first = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);
    assert.equal(firstOutput.decision, "block");
    assert.match(firstOutput.reason, /cycle fallback.*first caller group.*distinct items.*later groups.*every group/isu);

    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def combine(*chains):",
      "        items = unique(flatten(chains))",
      "        try:",
      "            return stable_order(items)",
      "        except DependencyCycleError:",
      "            warnings.warn('Conflicting chains:\\n%s' % '\\n'.join(",
      "                ', '.join(str(item) for item in chain) for chain in chains",
      "            ))",
      "            return items",
      "",
    ].join("\n"));
    const second = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(second.status, 0, second.stderr);
    const secondOutput = JSON.parse(second.stdout);
    assert.equal(secondOutput.decision, "block");
    assert.match(secondOutput.reason, /flattens caller groups.*into member text.*collection boundaries/isu);
  });
});

test("Stop blocks a hand-rolled dependency loop when a local primitive exists", () => {
  withGitRepo({
    "src/registry.js": "export function combine(chains) { return chains.flat(); }\n",
    "src/stable-order.js": "export function stableTopologicalSort(items, graph) { return items; }\n",
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.js"), [
      "export function combine(chains) {",
      "  const dependencies = new Map();",
      "  const emitted = new Set();",
      "  while (emitted.size < dependencies.size) {",
      "    const ready = [...dependencies].filter(([item, needs]) =>",
      "      !emitted.has(item) && [...needs].every((need) => emitted.has(need)));",
      "    if (ready.length === 0) throw new Error('cycle');",
      "    emitted.add(ready[0][0]);",
      "  }",
      "  return [...emitted];",
      "}",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /src\/registry\.js.*src\/stable-order\.js:1/isu);
  });
});

test("Stop blocks a private multi-input helper beside a fixed-arity public seam", () => {
  withGitRepo({
    "src/registry.py": [
      "class Registry:",
      "    def combine(left, right):",
      "        return pairwise_order(left, right)",
      "",
      "    def render(self):",
      "        return self.combine(self._groups[0], self._groups[1])",
      "",
    ].join("\n"),
  }, (root) => {
    writeFileSync(resolve(root, "src/registry.py"), [
      "class Registry:",
      "    def combine(left, right):",
      "        return Registry._combine_groups([left, right])",
      "",
      "    @staticmethod",
      "    def _combine_groups(groups):",
      "        return stable_order(groups)",
      "",
      "    def render(self):",
      "        return self._combine_groups(self._groups)",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [entry, "stop"], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /private multi-input helper _combine_groups.*named public seam combine/isu);
  });
});

test("unrelated prompts stay silent and malformed prompt events fail open", () => {
  const unrelated = run("user-prompt", { prompt: "Rename this local variable." });
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.equal(unrelated.stdout, "");

  const malformed = run("user-prompt", { cwd: process.cwd() });
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.equal(malformed.stdout, "");
});
