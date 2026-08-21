// harness-source-hash: sha256:03d18d20a325dc52bf5f629a3b077cb21fa4769573273d503348dd8dc3ae9cb5
import {
  isRecord
} from "./chunk-DYCLW5DJ.mjs";

// plugins/git-delivery/src/lib/worktree-intent.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, isAbsolute, join as join3, relative, resolve } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// core/src/state-file.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync as mkdirSync2, renameSync, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname(path);
  const temporary = join2(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync2(directory, { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync2(temporary, `${JSON.stringify(value)}
`, { encoding: "utf8", mode: FILE_MODE, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
    }
    return false;
  }
}

// plugins/git-delivery/src/lib/worktree-intent.ts
var WORKTREE_STATE_DIR = ".git-delivery/state";
var RECEIPT_VERSION = 1;
var CREATION_PATTERNS = [
  /\b(?:create|creating|use|using)\s+(?:a |an |the )?(?:linked |isolated )?(?:git\s+)?worktree\b/iu,
  /(?:用|使用)\s*git\s+worktree\b/iu,
  /隔离\s*(?:工作区|checkout|检出|审查)/iu,
  /\bisolation\s*[:=]\s*worktree\b/iu,
  /\.worktrees\//u,
  /(?:创建|新建|开一个)[^。.\n]{0,20}worktree/iu,
  /worktree[^。.\n]{0,20}(?:创建|新建)/iu
];
function stripNegatedSpans(text) {
  return text.replace(/(?:不要|别|勿|禁止)[^。\n]{0,40}(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ").replace(/(?:do not|don't|without)\s+(?:use |create |creating )?(?:a |an )?(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ").replace(/不要改\s*git\s*工作区/giu, " ");
}
function userRequestedWorktreeCreate(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return false;
  const remaining = stripNegatedSpans(prompt);
  return CREATION_PATTERNS.some((pattern) => pattern.test(remaining));
}
function worktreeIsolationRequested(toolInput) {
  if (!isRecord(toolInput)) return false;
  const isolation = toolInput.isolation ?? toolInput.Isolation;
  if (isolation === "worktree") return true;
  return isRecord(isolation) && (isolation.type === "worktree" || isolation.mode === "worktree");
}
function worktreeCreateReceiptPath(cwd, sessionId) {
  return join3(
    resolve(cwd),
    WORKTREE_STATE_DIR,
    "sessions",
    digestKey(sessionId || "missing"),
    "worktree-create.json"
  );
}
function isWorktreeAuthorizationStateTarget(cwd, target) {
  const stateRoot = resolve(cwd, WORKTREE_STATE_DIR);
  const candidate = resolve(target);
  const relation = relative(stateRoot, candidate);
  return relation === "" || !relation.startsWith("..") && !isAbsolute(relation);
}
function commandReferencesWorktreeAuthorizationState(command) {
  return /(?:^|[^A-Za-z0-9._-])\.git-delivery[\\/]state(?:[\\/]|\b)/u.test(command);
}
function isWorktreeCreateSource(value) {
  return value === "user-prompt";
}
function parseReceipt(value) {
  if (!isRecord(value) || value.version !== RECEIPT_VERSION || value.allowed !== true) {
    return null;
  }
  if (!isWorktreeCreateSource(value.source) || typeof value.createdAt !== "string" || !value.createdAt) {
    return null;
  }
  return {
    version: 1,
    allowed: true,
    source: "user-prompt",
    createdAt: value.createdAt
  };
}
function readWorktreeCreateReceipt(cwd, sessionId) {
  if (!sessionId) return null;
  try {
    return parseReceipt(JSON.parse(readFileSync2(worktreeCreateReceiptPath(cwd, sessionId), "utf8")));
  } catch {
    return null;
  }
}
function recordWorktreeCreateAllowance(cwd, sessionId, source, _processId) {
  if (!sessionId || source !== "user-prompt") return false;
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const receipt = { version: 1, allowed: true, source, createdAt };
  const path = worktreeCreateReceiptPath(cwd, sessionId);
  mkdirSync3(dirname2(path), { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(join3(resolve(cwd), ".git-delivery"));
  return atomicWriteJson(path, receipt);
}
function isWorktreeCreatePermitted(mode, receipt) {
  if (mode === "allow") return true;
  return receipt?.allowed === true;
}

export {
  WORKTREE_STATE_DIR,
  userRequestedWorktreeCreate,
  worktreeIsolationRequested,
  isWorktreeAuthorizationStateTarget,
  commandReferencesWorktreeAuthorizationState,
  readWorktreeCreateReceipt,
  recordWorktreeCreateAllowance,
  isWorktreeCreatePermitted
};
