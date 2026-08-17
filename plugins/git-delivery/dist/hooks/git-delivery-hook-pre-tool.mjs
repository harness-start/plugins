#!/usr/bin/env node
// harness-source-hash: sha256:dbb88ce861ce71a6e9093e34906a0cf051529dd89f2e8e773e63245c0f7c4c8c
import {
  additionalContextOutput,
  eventCwd,
  eventToolInput,
  eventToolName,
  extractShellCommand,
  isRecord,
  preToolDeny,
  readStdinJson,
  writeJson
} from "../chunks/chunk-6A2XCROP.mjs";

// plugins/git-delivery/src/checks/command-rules.ts
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// core/src/shell-parse.ts
function decodeAnsiCQuoteEscape(command, slashIndex) {
  const marker = command[slashIndex + 1] ?? "";
  const simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(marker)) {
    return { value: simple.get(marker) ?? "", endIndex: slashIndex + 1 };
  }
  const numeric = marker === "x" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,2}/iu) : marker === "u" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,4}/iu) : marker === "U" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,8}/iu) : command.slice(slashIndex + 1).match(/^[0-7]{1,3}/u);
  if (numeric?.[0]) {
    const radix = marker === "x" || marker === "u" || marker === "U" ? 16 : 8;
    const codePoint = Number.parseInt(numeric[0], radix);
    if (codePoint <= 1114111) {
      const offset = marker === "x" || marker === "u" || marker === "U" ? 2 : 1;
      return {
        value: String.fromCodePoint(codePoint),
        endIndex: slashIndex + offset + numeric[0].length - 1
      };
    }
  }
  if (marker === "\n") return { value: "", endIndex: slashIndex + 1 };
  return { value: `\\${marker}`, endIndex: slashIndex + 1 };
}
var EMPTY_OPTIONS = /* @__PURE__ */ new Set();
var SIMPLE_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["command", "exec", "nohup", "busybox", "time"]);
var SUDO_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-D",
  "-g",
  "-h",
  "-p",
  "-R",
  "-T",
  "-u",
  "--chdir",
  "--close-from",
  "--group",
  "--host",
  "--prompt",
  "--role",
  "--type",
  "--user"
]);
var ENV_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-S",
  "-u",
  "--chdir",
  "--split-string",
  "--unset"
]);
var XARGS_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-a",
  "-d",
  "-E",
  "-I",
  "-L",
  "-n",
  "-P",
  "-s",
  "--arg-file",
  "--delimiter",
  "--eof",
  "--max-args",
  "--max-chars",
  "--max-lines",
  "--max-procs",
  "--replace"
]);
var TIMEOUT_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-s",
  "--signal",
  "-k",
  "--kill-after"
]);
var NICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set(["-n", "--adjustment"]);
var STDBUF_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-i",
  "--input",
  "-o",
  "--output",
  "-e",
  "--error"
]);
var IONICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "--class",
  "-n",
  "--classdata",
  "-p",
  "--pid"
]);
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}
function tokenBasename(token) {
  return token.split("/").at(-1) ?? "";
}
function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_COMMAND_WRAPPERS.has(name)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (name === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "timeout") {
      index = skipWrapperOptions(tokens, index + 1, TIMEOUT_OPTIONS_WITH_VALUE);
      if (index < tokens.length && tokens[index] && !COMMAND_SEPARATORS.has(tokens[index] ?? "")) {
        index += 1;
      }
      continue;
    }
    if (name === "nice") {
      index = skipWrapperOptions(tokens, index + 1, NICE_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "stdbuf") {
      index = skipWrapperOptions(tokens, index + 1, STDBUF_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "ionice") {
      index = skipWrapperOptions(tokens, index + 1, IONICE_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: name || token,
      args: tokens.slice(index + 1),
      stdinDriven
    };
  }
  return null;
}
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let tokenStarted = false;
  let quote = null;
  let ansiCQuote = false;
  let escaped = false;
  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1];
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (ansiCQuote && char === "\\") {
        const decoded = decodeAnsiCQuoteEscape(command, index);
        current += decoded.value;
        tokenStarted = true;
        index = decoded.endIndex;
        continue;
      }
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        ansiCQuote = false;
        continue;
      }
      current += char;
      tokenStarted = true;
      continue;
    }
    if (char === "$" && (next === '"' || next === "'")) {
      quote = next;
      ansiCQuote = next === "'";
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "#" && !tokenStarted) break;
    if (char === "&" && next === "&") {
      pushCurrent();
      tokens.push("&&");
      index += 1;
      continue;
    }
    if (char === "&") {
      pushCurrent();
      tokens.push("&");
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      tokens.push("||");
      index += 1;
      continue;
    }
    if (char === ";" || char === "|") {
      pushCurrent();
      tokens.push(char);
      continue;
    }
    current += char;
    tokenStarted = true;
  }
  pushCurrent();
  return tokens;
}
function splitShellLogicalLines(command) {
  const lines2 = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n") {
      if (current.trim()) lines2.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines2.push(current);
  return lines2;
}
function shellCommandInvocations(command) {
  const invocations = [];
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation) invocations.push(invocation);
      segment = [];
    }
  }
  return invocations;
}

// plugins/git-delivery/src/checks/command-rules.ts
var TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert"
];
var BRANCH = new RegExp(`^(?:${TYPES.join("|")})/[a-z0-9][a-z0-9._\\-/]{1,79}$`, "u");
var COMMIT = new RegExp(`^(?:${TYPES.join("|")})(?:\\([^)]+\\))?!?:\\s.+`, "u");
var GENERIC = /^(?:fix|update|move|迁移|修复|优化|调整|兼容|补充|完善|修改|cleanup|clean up|refactor|misc|stuff)$/iu;
var GARBLED = /\uFFFD|[\x00-\x08\x0E-\x1F\x7F]|[\uE000-\uF8FF]|\u00C3[\u0080-\u00BF]/u;
function finding(action, id, reason, command, recovery) {
  return { action, id, reason, command, recovery };
}
function gitInvocations(command, initialCwd) {
  if (typeof command !== "string" || !command.trim()) return [];
  return shellCommandInvocations(command).flatMap((invocation) => {
    if (invocation.executable !== "git" || invocation.stdinDriven) return [];
    const rawArgs = invocation.args;
    let cursor = 0;
    let cwd = resolve(initialCwd);
    while (cursor < rawArgs.length) {
      const token = rawArgs[cursor];
      const next = rawArgs[cursor + 1];
      if (token === "-C" && next) {
        cwd = resolve(cwd, next);
        cursor += 2;
        continue;
      }
      if (token !== void 0 && ["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
        cursor += 2;
        continue;
      }
      if (token !== void 0 && /^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
        cursor += 1;
        continue;
      }
      break;
    }
    return [{ cwd, subcommand: rawArgs[cursor] ?? "", args: rawArgs.slice(cursor + 1) }];
  });
}
function gitAdd(invocation, command) {
  if (invocation.subcommand !== "add") return null;
  const args = invocation.args;
  if (args.some((token) => [".", "./", "*", "./*"].includes(token) || token.startsWith("--pathspec-from-file"))) {
    return finding(
      "deny",
      "Git Add Guard",
      "bulk staging may include changes from other tasks",
      command,
      "stage each file explicitly with git add <specific-file-path>"
    );
  }
  const hasBulk = args.some(
    (token) => ["-A", "--all", "-u", "--update"].includes(token) || /^-[^-]*[Au]/u.test(token)
  );
  const explicit = args.some((token, index) => {
    const previous = index > 0 ? args[index - 1] : void 0;
    return !token.startsWith("-") && (previous === void 0 || !["--chmod", "--intent-to-add"].includes(previous));
  });
  if (hasBulk && !explicit) {
    return finding(
      "deny",
      "Git Add Guard",
      "-A/--all/-u without a specific path stages changes in bulk",
      command,
      "stage each file explicitly with git add <specific-file-path>"
    );
  }
  return null;
}
function destructiveGit(invocation, command) {
  const subcommand = invocation.subcommand;
  const args = invocation.args;
  if (subcommand === "update-ref" && args.includes("-d") && args.some((arg) => arg.startsWith("refs/original/"))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "deleting refs/original removes recovery references from history rewrites",
      command,
      "clean up recovery references only after a controlled history migration is verified"
    );
  }
  if (subcommand === "reset" && args.includes("--hard")) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git reset --hard discards uncommitted changes",
      command,
      "save the diff or stash first, then use a non-destructive reset"
    );
  }
  if (subcommand === "clean") {
    const dryRun = args.includes("-n") || args.includes("--dry-run") || args.some((arg) => /^-[^-]*n/u.test(arg));
    const destructive = args.some((arg) => ["--force", "--directory"].includes(arg) || /^-[^-]*[fd]/u.test(arg));
    if (destructive && !dryRun) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git clean -f/-d permanently deletes untracked files or directories",
        command,
        "run git clean -nd first and handle targets individually"
      );
    }
  }
  if (subcommand === "push") {
    const lease = args.some((arg) => arg === "--force-with-lease" || arg.startsWith("--force-with-lease="));
    const force = args.some((arg) => arg === "--force" || arg === "-f" || /^-[^-]*f/u.test(arg));
    if (force && !lease) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git push --force overwrites remote history",
        command,
        "use --force-with-lease and verify the remote baseline"
      );
    }
  }
  if (["filter-repo", "filter-branch"].includes(subcommand)) {
    return finding(
      "deny",
      "Dangerous Git Command",
      `${subcommand} rewrites repository history`,
      command,
      "run it in a separate clone and preserve recovery references"
    );
  }
  if (subcommand === "stash" && args[0] === "clear") {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git stash clear permanently deletes every stash",
      command,
      "inspect stashes individually and delete only an explicitly authorized stash"
    );
  }
  if (subcommand === "stash" && args[0] === "drop") {
    const approved = /(?:^|[;&|]\s*)AI_EXPERTS_ALLOW_GIT_STASH_DROP=1\s+git(?:\s+-\S+)*\s+stash\s+drop\s+['"]?stash@\{\d+\}['"]?(?:\s|$)/u.test(command);
    const stashRef = args[1];
    if (!approved || args.length !== 2 || stashRef === void 0 || !/^stash@\{\d+\}$/u.test(stashRef)) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git stash drop requires an inline approval sentinel and an explicit stash@{N}",
        command,
        "use AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{N}'"
      );
    }
  }
  if (subcommand === "checkout" && args.includes("--") && args.some((arg) => [".", "./", "*", "./*"].includes(arg))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "bulk checkout discards working-tree changes",
      command,
      "save the diff first and restore one file at a time"
    );
  }
  if (subcommand === "restore" && (args.some((arg) => [".", "./", "*", "./*"].includes(arg)) || args.some((arg, index) => arg === "--source=HEAD" || arg === "--source" && args[index + 1] === "HEAD"))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git restore overwrites working-tree changes from HEAD or a bulk target",
      command,
      "save the diff and restore only an explicitly authorized individual file and source"
    );
  }
  return null;
}
function branchName(invocation, command) {
  if (!["checkout", "switch"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  const flagIndex = args.findIndex((arg) => ["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(arg));
  const branch = flagIndex >= 0 ? args[flagIndex + 1] : null;
  if (!branch || BRANCH.test(branch)) return null;
  return finding(
    "deny",
    "Branch Naming Guard",
    `branch name ${branch} does not match <type>/<lowercase-slug>`,
    command,
    `use ${TYPES.join("|")}/<lowercase-slug>`
  );
}
function conflictChoice(invocation, command) {
  if (!["checkout", "restore"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  if (!args.includes("--ours") && !args.includes("--theirs")) return null;
  const divider = args.indexOf("--");
  const candidates = divider >= 0 ? args.slice(divider + 1) : args.filter((arg) => !arg.startsWith("-") && !["checkout", "restore"].includes(arg));
  const targets = candidates.filter((arg) => !["ours", "theirs"].includes(arg));
  const unsafe = targets.length !== 1 || targets.some((target) => {
    if ([".", "./", "*", "./*"].includes(target) || /[*?[]/u.test(target) || target.endsWith("/")) return true;
    try {
      return lstatSync(resolve(invocation.cwd, target)).isDirectory();
    } catch {
      return false;
    }
  });
  return unsafe ? finding(
    "deny",
    "Bulk Conflict Choice Guard",
    "ours/theirs may be applied only to one explicit file",
    command,
    "review each conflict and choose a side one file at a time"
  ) : null;
}
function commitMessage(invocation, command) {
  if (invocation.subcommand !== "commit") return null;
  const args = invocation.args;
  if (args.some((arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg))) return null;
  if (/\$\(\s*cat\s+<</u.test(command)) {
    return finding(
      "deny",
      "Commit Heredoc Guard",
      "commit messages must not be generated through heredoc command substitution",
      command,
      "use one or more git commit -m strings"
    );
  }
  const paragraphs = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === void 0) continue;
    const next = args[index + 1];
    if (["-m", "--message"].includes(token) && next) {
      index += 1;
      paragraphs.push(next);
    } else if (token.startsWith("--message=")) {
      paragraphs.push(token.slice(10));
    } else if (/^-m.+/u.test(token)) {
      paragraphs.push(token.slice(2));
    } else if (["-F", "--file"].includes(token) && next) {
      index += 1;
      const path = next;
      try {
        paragraphs.push(readFileSync(resolve(invocation.cwd, path), "utf8"));
      } catch {
      }
    } else if (token.startsWith("--file=")) {
      try {
        paragraphs.push(readFileSync(resolve(invocation.cwd, token.slice(7)), "utf8"));
      } catch {
      }
    } else if (/^-F.+/u.test(token)) {
      try {
        paragraphs.push(readFileSync(resolve(invocation.cwd, token.slice(2)), "utf8"));
      } catch {
      }
    }
  }
  const message = paragraphs.join("\n\n").trim();
  if (!message) return null;
  const first = message.split("\n").find((line) => line.trim())?.trim() ?? "";
  const description = (first.match(/^[^:]+:\s*(.+)$/u)?.[1] ?? first).trim();
  const issues = [];
  if (first.length < 8) issues.push("first line is too short");
  if (!COMMIT.test(first)) issues.push("not in Conventional Commits format");
  if (GENERIC.test(description)) issues.push("description is too vague");
  if (GARBLED.test(message)) issues.push("contains garbled text or control characters");
  return issues.length ? finding(
    "deny",
    "Commit Message Guard",
    issues.join("\uFF1B"),
    command,
    "use <type>(<scope>): <specific-description>"
  ) : null;
}
function classifyDeliveryCommand(command, cwd) {
  const findings = [];
  for (const invocation of gitInvocations(command, cwd)) {
    for (const result of [
      gitAdd(invocation, command),
      destructiveGit(invocation, command),
      branchName(invocation, command),
      conflictChoice(invocation, command),
      commitMessage(invocation, command)
    ]) {
      if (result) findings.push(result);
    }
  }
  return findings;
}
function formatDeliveryFinding(value) {
  return [
    `[${value.id}] ${value.action === "deny" ? "Blocked" : "Risk notice"}`,
    "",
    `Reason: ${value.reason}`,
    `Recovery/alternative: ${value.recovery}`,
    ...value.action === "deny" ? [
      "",
      "blockingContract:",
      "  observedFacts: The command or repository state matched a local Git delivery rule.",
      "  harm: The operation may lose changes, contaminate commit boundaries, hide conflicts, or impair recovery.",
      "  unblockWhen: Use an operation with explicit targets, recoverability, and clear commit boundaries.",
      `  recovery: ${value.recovery}`
    ] : []
  ].join("\n");
}

// plugins/git-delivery/src/checks/state-checks.ts
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync as lstatSync2,
  readFileSync as readFileSync2,
  unlinkSync
} from "node:fs";
import { basename, extname, join, posix, resolve as resolve2 } from "node:path";
var WRITE_COMMANDS = /* @__PURE__ */ new Set([
  "add",
  "am",
  "checkout",
  "cherry-pick",
  "commit",
  "merge",
  "mv",
  "pull",
  "rebase",
  "reset",
  "restore",
  "rm",
  "stash",
  "switch"
]);
var LOCK_AGE_MS = 5 * 60 * 1e3;
var MANIFESTS = [
  "package.json",
  "composer.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "mix.exs",
  "Gemfile",
  "CMakeLists.txt"
];
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".c",
  ".cpp",
  ".cs",
  ".ex",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue"
]);
var CONFIG_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cfg",
  ".conf",
  ".env",
  ".hcl",
  ".ini",
  ".json",
  ".properties",
  ".tf",
  ".tfvars",
  ".toml",
  ".xml",
  ".yaml",
  ".yml"
]);
function errorText(error) {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8e3,
      maxBuffer: 2 * 1024 * 1024
    }).trim();
  } catch {
    return null;
  }
}
function lines(args, cwd) {
  const output = git(args, cwd);
  return output === null ? null : output ? output.split("\n").filter(Boolean) : [];
}
function finding2(action, id, reason, recovery) {
  return { action, id, reason, recovery };
}
function processState(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (isRecord(error) && error.code === "ESRCH") return "dead";
    return "unknown";
  }
}
function staleLock(invocation) {
  if (!WRITE_COMMANDS.has(invocation.subcommand)) return null;
  const rawGitDir = git(["rev-parse", "--git-dir"], invocation.cwd);
  if (!rawGitDir) return null;
  const lockPath = resolve2(invocation.cwd, rawGitDir, "index.lock");
  if (!existsSync(lockPath)) return null;
  let snapshot;
  try {
    snapshot = lstatSync2(lockPath);
  } catch {
    return null;
  }
  if (!snapshot.isFile() || snapshot.isSymbolicLink()) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `${lockPath} is not a regular lock file that can be handled safely`,
      "stop Git writes and manually inspect the Git directory and lock-file type"
    );
  }
  const age = Date.now() - snapshot.mtimeMs;
  if (age < LOCK_AGE_MS) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `index.lock is only ${Math.max(0, Math.round(age / 1e3))} seconds old and has not passed the safety threshold`,
      "wait for the current Git operation to finish, then retry"
    );
  }
  let parsedPid = null;
  try {
    const match = readFileSync2(lockPath, "utf8").slice(0, 64).match(/^(\d+)\s/u)?.[1];
    if (match !== void 0) parsedPid = Number(match);
  } catch {
  }
  if (parsedPid === null || !Number.isSafeInteger(parsedPid) || parsedPid <= 0) {
    return finding2(
      "deny",
      "Git Lock Guard",
      "the stale index.lock has no verifiable holder PID; automatic deletion is refused",
      `confirm that no Git process is running, then delete ${lockPath} manually`
    );
  }
  const pid = parsedPid;
  const holder = processState(pid);
  if (holder !== "dead") {
    return finding2(
      "deny",
      "Git Lock Guard",
      holder === "alive" ? `PID ${pid} recorded by index.lock is still alive` : `cannot confirm that PID ${pid} has exited`,
      "wait for the holder to finish; handle the lock file only after confirming that the process exited"
    );
  }
  try {
    const current = lstatSync2(lockPath);
    const sameFile = current.isFile() && !current.isSymbolicLink() && current.dev === snapshot.dev && current.ino === snapshot.ino && current.mtimeMs === snapshot.mtimeMs;
    if (!sameFile) {
      return finding2(
        "deny",
        "Git Lock Guard",
        "index.lock changed during verification; automatic deletion is refused",
        "recheck the current Git holder and lock-file state"
      );
    }
    unlinkSync(lockPath);
    return finding2(
      "report",
      "Git Lock Guard",
      `removed an index.lock that was ${Math.round(age / 1e3)} seconds old after PID ${pid} exited`,
      "no action is required; if Git still fails, check for a new lock holder"
    );
  } catch (error) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `the stale index.lock could not be removed safely: ${errorText(error)}`,
      `confirm that no Git process is running, then delete ${lockPath} manually`
    );
  }
}
function readBoundaryRules(root) {
  const configPath = join(root, ".ai-experts", "commit-boundaries.json");
  if (!existsSync(configPath)) return { rules: [], error: null };
  let value;
  try {
    value = JSON.parse(readFileSync2(configPath, "utf8"));
  } catch (error) {
    return { rules: [], error: `failed to parse ${configPath}: ${errorText(error)}` };
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.boundaries)) {
    return { rules: [], error: `${configPath} must contain version: 1 and a boundaries array` };
  }
  const rules = [];
  const ids = /* @__PURE__ */ new Set();
  for (const [index, item] of value.boundaries.entries()) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || !Array.isArray(item.prefixes) || item.prefixes.length === 0) {
      return { rules: [], error: `boundaries[${index}] must have a unique non-empty id and a non-empty prefixes array` };
    }
    ids.add(item.id);
    for (const prefixValue of item.prefixes) {
      if (typeof prefixValue !== "string" || !prefixValue.trim()) {
        return { rules: [], error: `boundaries[${index}].prefixes may contain only non-empty strings` };
      }
      const segments = prefixValue.replaceAll("\\", "/").split("/");
      if (segments.includes("..")) {
        return { rules: [], error: `a prefix in boundaries[${index}] must not contain ..` };
      }
      const prefix = prefixValue.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
      rules.push({ id: item.id, prefix });
    }
  }
  rules.sort((left, right) => right.prefix.length - left.prefix.length);
  return { rules, error: null };
}
function boundaryFor(file, root, rules) {
  const normalized = file.replaceAll("\\", "/");
  const explicit = rules.find(
    (rule) => !rule.prefix || normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)
  );
  if (explicit) return explicit.id;
  let directory = posix.dirname(normalized);
  while (true) {
    const diskPath = directory === "." ? root : join(root, directory);
    if (MANIFESTS.some((name) => existsSync(join(diskPath, name)))) {
      return directory === "." ? "repo-root" : directory;
    }
    if (directory === ".") return "repo-root";
    const parent = posix.dirname(directory);
    if (parent === directory) return "repo-root";
    directory = parent;
  }
}
function commitState(invocation) {
  if (invocation.subcommand !== "commit" || invocation.args.some(
    (arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg)
  )) return [];
  const staged = lines(["diff", "--cached", "--name-only"], invocation.cwd);
  if (!staged) return [];
  const unstaged = lines(["diff", "--name-only"], invocation.cwd);
  const unstagedSet = new Set(unstaged ?? []);
  const overlap = staged.filter((file) => unstagedSet.has(file));
  const findings = [];
  const commitAll = invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg));
  if (overlap.length && !commitAll) {
    findings.push(finding2(
      "report",
      "Partial Staging Guard",
      `${overlap.length} file(s) have both staged and unstaged changes: ${overlap.slice(0, 8).join(", ")}`,
      "inspect git diff --cached -- <file> and git diff -- <file> separately"
    ));
  }
  const files = commitAll ? [.../* @__PURE__ */ new Set([...staged, ...unstaged ?? []])] : staged;
  if (!files.length) return findings;
  const root = git(["rev-parse", "--show-toplevel"], invocation.cwd) || invocation.cwd;
  const boundaryConfig = readBoundaryRules(root);
  if (boundaryConfig.error) {
    findings.push(finding2(
      "deny",
      "Commit Scope Guard",
      boundaryConfig.error,
      "fix .ai-experts/commit-boundaries.json before committing again"
    ));
    return findings;
  }
  const nameStatus = lines(["diff", "--cached", "--name-status"], invocation.cwd);
  if (nameStatus?.length && nameStatus.every((line) => /^R\d*\t/u.test(line))) {
    if (files.length > 15) {
      findings.push(finding2(
        "report",
        "Commit Scope Guard",
        `rename-only commit contains ${files.length} migration entries`,
        "confirm that every migration mapping has been reconciled"
      ));
    }
    return findings;
  }
  const groups = /* @__PURE__ */ new Map();
  for (const file of files) {
    const boundary = boundaryFor(file, root, boundaryConfig.rules);
    if (!groups.has(boundary)) groups.set(boundary, { source: false, config: false });
    const group = groups.get(boundary);
    if (!group) continue;
    const extension = extname(file).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension)) group.source = true;
    if (CONFIG_EXTENSIONS.has(extension) || /^(?:Dockerfile|Jenkinsfile|Makefile)$/u.test(basename(file))) group.config = true;
  }
  const mixed = [...groups.values()].some((group) => group.source && group.config);
  if (groups.size >= 2 || mixed) {
    findings.push(finding2(
      "deny",
      "Commit Scope Guard",
      `commit crosses ${groups.size} manifest/explicit boundaries or mixes source with config/infra: ${[...groups.keys()].join(", ")}`,
      "unstage the batch and git add/commit each declared boundary and concern separately"
    ));
  } else if (files.length > 15) {
    findings.push(finding2(
      "report",
      "Commit Scope Guard",
      `one commit contains ${files.length} files`,
      "check whether it can be split into smaller atomic commits"
    ));
  }
  return findings;
}
function deliveryStateFindings(cwd, command) {
  return gitInvocations(command, cwd).flatMap((invocation) => {
    const lock = staleLock(invocation);
    return lock ? [lock, ...commitState(invocation)] : commitState(invocation);
  });
}

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-pre-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const command = extractShellCommand(eventToolName(event), eventToolInput(event));
  if (!command) return;
  const cwd = eventCwd(event);
  const findings = [
    ...classifyDeliveryCommand(command, cwd),
    ...deliveryStateFindings(cwd, command)
  ];
  const denied = findings.find((finding3) => finding3.action === "deny");
  if (denied) writeJson(preToolDeny(formatDeliveryFinding(denied)));
  else if (findings.length) {
    writeJson(additionalContextOutput(
      "PreToolUse",
      findings.map(formatDeliveryFinding).join("\n\n")
    ));
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[git-delivery] pre hook failed open: ${message}
`);
  process.exit(0);
});
