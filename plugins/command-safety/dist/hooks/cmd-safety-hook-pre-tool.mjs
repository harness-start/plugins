#!/usr/bin/env node
// harness-source-hash: sha256:a5dff611141c6124950dab985387a109a002279a4a08a3d6460fe443bb7387ba
import {
  additionalContextOutput,
  commandInvocation,
  eventCwd,
  eventToolInput,
  eventToolName,
  extractShellCommand,
  formatFinding,
  isRecord,
  loadUserConfig,
  matchRule,
  preToolDeny,
  readStdinJson,
  resolveRepoRoot,
  resolveRules,
  shellCommandInvocations,
  splitShellLogicalLines,
  tokenizeShell,
  writeJson
} from "../chunks/chunk-YFPU27WO.mjs";

// plugins/command-safety/src/lib/matchers.ts
var SHELL_TOOLS = /^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i;
function normalizeToolName(toolName) {
  if (typeof toolName !== "string" || !toolName) return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    notebookedit: "NotebookEdit",
    create_file: "Write",
    search_replace: "Edit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell"
  };
  const mapped = map[lower];
  if (mapped) return mapped;
  if (/^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|Bash|Shell)$/.test(toolName)) {
    return toolName;
  }
  return toolName;
}
function isShellTool(toolName) {
  return typeof toolName === "string" && SHELL_TOOLS.test(toolName);
}

// plugins/command-safety/src/engines/mysql-preflight.ts
function successfulPreflightEvidence(event) {
  const record = isRecord(event) ? event : null;
  const candidates = [
    event,
    record?.mysql_replication_preflight,
    record?.mysqlReplicationPreflight,
    record?.preflight
  ];
  return candidates.some((candidate) => {
    if (!isRecord(candidate)) return false;
    const tool = typeof candidate.tool === "string" && candidate.tool || candidate.tool_name || candidate.toolName;
    const exitCode = candidate.exit_code ?? candidate.exitCode;
    const timedOut = candidate.timed_out ?? candidate.timedOut;
    return tool === "mysql-replication-preflight" && exitCode !== void 0 && exitCode !== null && Number(exitCode) === 0 && timedOut !== true;
  });
}
function replicationMutation(command) {
  for (const { executable, args } of shellCommandInvocations(command)) {
    if (!["mysql", "mysqlsh"].includes(executable.toLowerCase())) continue;
    const mutation = args.join(" ").match(
      /\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu
    )?.[0];
    if (mutation) return mutation;
  }
  return null;
}
function mysqlReplicationPreflightFinding(command, event = {}) {
  const mutation = replicationMutation(command);
  if (!mutation) return null;
  if (successfulPreflightEvidence(event)) return null;
  return {
    action: "deny",
    id: "MySQL Replication Failover Guard",
    reason: `missing successful replication preflight evidence: ${mutation}`,
    recovery: "run mysql-replication-preflight first and verify replication threads, lag, and GTID coverage"
  };
}
function mysqlPreflightDenyMessage(finding, command = "") {
  return [
    `[${finding.id}] Blocked`,
    "",
    `Reason: ${finding.reason}`,
    `Recovery/alternative: ${finding.recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The command matches a high-risk replication state change without successful preflight evidence.",
    "  harm: It could cause an unverifiable primary/replica switchover or data inconsistency.",
    "  unblockWhen: Provide successful mysql-replication-preflight evidence.",
    `  recovery: ${finding.recovery}`
  ].join("\n");
}

// plugins/command-safety/src/engines/secret-read.ts
import { basename } from "node:path";
var WHITELIST = [/(?:^|\/)(?:tests?|__tests__|fixtures|testdata|examples?|samples?|templates?|docs?)\//iu, /\.(?:md|rst|adoc)$/iu, /\.env\.(?:example|template|sample|dist)$/iu];
var SENSITIVE = [/(?:^|\/)\.env(?:\.[^.]+)?$/iu, /\.(?:pem|key|p12|pfx|jks|keystore)$/iu, /\bid_(?:rsa|ed25519|ecdsa|dsa)$/iu, /(?:^|\/)\.ssh\//iu, /(?:credentials\.json|service[-_]?account[-_]?key|\.aws\/credentials|\.docker\/config\.json|\.npmrc|\.pypirc|\.netrc|\.git-credentials|htpasswd)$/iu];
function secretReadReport(targets) {
  for (const raw of targets) {
    const path = String(raw).replaceAll("\\", "/");
    if (WHITELIST.some((pattern) => pattern.test(path))) continue;
    if (SENSITIVE.some((pattern) => pattern.test(path)) || /(?:secret|credential|(?:^|[_.-])token[_.-]|passwd|password|api[-_]?key)/iu.test(basename(path))) return `[Secret Read Notice] Sensitive file read detected

File: ${raw}
Read content may enter the agent context; read only fields required by the task and never echo credentials in output.`;
  }
  return null;
}

// plugins/command-safety/src/lib/deny-state.ts
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2, resolve } from "node:path";

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

// plugins/command-safety/src/lib/deny-state.ts
var DEFAULT_WINDOW_MS = 10 * 60 * 1e3;
var DEFAULT_THRESHOLD = 3;
var STATE_DIR_RELATIVE = ".command-safety/.state";
function eventCwd2(event) {
  return typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
}
function stateFile(cwd) {
  return join2(resolve(cwd), STATE_DIR_RELATIVE, "denies.jsonl");
}
function ensureStateFile(event) {
  const cwd = eventCwd2(event);
  const path = stateFile(cwd);
  try {
    const directory = join2(resolve(cwd), STATE_DIR_RELATIVE);
    mkdirSync2(directory, { recursive: true, mode: 448 });
    ensurePluginWorkdirGitignore(join2(resolve(cwd), ".command-safety"));
    return path;
  } catch {
    return null;
  }
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function target(event, command) {
  const cwd = eventCwd2(event);
  const tool = isRecord(event.tool) ? event.tool : null;
  const input = tool && isRecord(tool.input) ? tool.input : null;
  const fileTargets = tool && Array.isArray(tool.fileTargets) ? tool.fileTargets : null;
  const direct = input?.file_path ?? input?.filePath ?? input?.path ?? fileTargets?.[0];
  if (direct) return hash(resolve(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter(
    (token) => ![";", "&&", "||", "|", "&"].includes(token)
  );
  const operation = tokens.find(
    (token) => /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(
      token.split("/").at(-1) ?? ""
    )
  )?.split("/").at(-1) ?? tokens[0] ?? "command";
  const path = [...tokens].reverse().find(
    (token) => !token.startsWith("-") && (/^(?:\/|\.|~|\$)/u.test(token) || token.includes("/"))
  );
  return hash(`${operation}:${path ?? tokens[1] ?? ""}`);
}
function isDenyEntry(value) {
  return isRecord(value) && typeof value.ts === "number";
}
function entries(event) {
  const path = stateFile(eventCwd2(event));
  if (!path) return [];
  try {
    return readFileSync2(path, "utf8").split("\n").filter(Boolean).map((line) => {
      const parsed = JSON.parse(line);
      return parsed;
    }).filter(isDenyEntry);
  } catch {
    return [];
  }
}
function escalationMessage(event, command, options = {}) {
  if (/(?:^|\s)#\s*escalation-ok\b/iu.test(command)) return null;
  const windowMs = typeof options.windowMinutes === "number" && options.windowMinutes > 0 ? options.windowMinutes * 60 * 1e3 : DEFAULT_WINDOW_MS;
  const threshold = typeof options.threshold === "number" && options.threshold > 0 ? options.threshold : DEFAULT_THRESHOLD;
  const key = target(event, command);
  const cutoff = Date.now() - windowMs;
  const currentTurn = event.turn_id ?? event.turnId ?? "";
  const recent = entries(event).filter(
    (entry) => entry.ts >= cutoff && entry.target === key && (!currentTurn || entry.turn !== currentTurn)
  );
  const turns = new Set(recent.map((entry) => entry.turn).filter(Boolean));
  const count = Math.max(
    turns.size,
    recent.filter((entry) => !entry.turn).length
  );
  return count >= threshold ? `[Deny Escalation Guard] command-safety has denied the same target ${count} times.

Stop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.` : null;
}
function recordDeny(event, command, hook) {
  const path = ensureStateFile(event);
  if (!path) return;
  try {
    appendFileSync(
      path,
      `${JSON.stringify({
        ts: Date.now(),
        turn: event.turn_id ?? event.turnId ?? "",
        target: target(event, command),
        hook
      })}
`,
      { mode: 384 }
    );
  } catch {
  }
}

// plugins/command-safety/src/engines/dangerous-rm.ts
import { homedir } from "node:os";
import { dirname, resolve as resolve2 } from "node:path";
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&", "{", "}"]);
var SHELL_COMMANDS = /* @__PURE__ */ new Set(["bash", "dash", "sh", "zsh"]);
function recursiveRmTarget(args, cwd, stdinDriven) {
  const recursive = args.some(
    (argument) => argument === "--recursive" || /^-[^-]*[rR]/u.test(argument) && argument !== "--"
  );
  if (!recursive) return null;
  if (stdinDriven) {
    return "xargs dynamically supplies paths to rm -r, so the deletion scope cannot be proven safe";
  }
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
    const expanded = argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
    const absolute = resolve2(cwd, expanded);
    if (/^\/+$/u.test(expanded)) return "rm -r / would delete the entire filesystem";
    if (absolute === resolve2(cwd) || /^(?:\.\/)?\*+(?:\/\*+)*$/u.test(expanded)) {
      return "rm -r . would delete everything in the current directory";
    }
    if (homeReference || absolute === homedir()) {
      return "rm -r ~ targets the home directory and is extremely dangerous";
    }
    if (dirname(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
      return "rm -r targeting a top-level directory such as /tmp or /home is extremely dangerous";
    }
  }
  return null;
}
function expandPathToken(argument, cwd) {
  return argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
}
function broadDeleteReason(argument, cwd, verb) {
  const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
  const expanded = expandPathToken(argument, cwd);
  const absolute = resolve2(cwd, expanded);
  if (/^\/+$/u.test(expanded)) return `${verb} / would delete the entire filesystem`;
  if (absolute === resolve2(cwd) || expanded.startsWith("./*") || expanded === ".") {
    return `${verb} . would delete everything in the current directory`;
  }
  if (homeReference || absolute === homedir()) {
    return `${verb} ~ targets the home directory and is extremely dangerous`;
  }
  if (dirname(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
    return `${verb} targeting a top-level directory such as /tmp or /home is extremely dangerous`;
  }
  return null;
}
function findDeleteReason(args, cwd) {
  if (!args.some((argument) => argument === "-delete")) return null;
  const paths = [];
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    if (!argument.startsWith("-")) paths.push(argument);
  }
  if (paths.length === 0) {
    return "find -delete without an explicit path defaults to the current directory";
  }
  for (const argument of paths) {
    const reason = broadDeleteReason(argument, cwd, "find -delete");
    if (reason) return reason;
  }
  return null;
}
function dangerousCommandReason(command, cwd, depth = 0) {
  if (depth < 4) {
    for (const nestedCommand of nestedCommandSubstitutions(command)) {
      const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
      if (reason) return reason;
    }
  } else if (hasCommandSubstitution(command)) {
    return "nested command substitutions are too deep to prove the deletion scope safe";
  }
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
      if (invocation?.executable === "rm") {
        const reason = recursiveRmTarget(
          invocation.args,
          cwd,
          invocation.stdinDriven
        );
        if (reason) return reason;
      }
      if (invocation?.executable === "find") {
        const reason = findDeleteReason(invocation.args, cwd);
        if (reason) return reason;
      }
      if (invocation?.executable === "eval") {
        const nestedCommand = invocation.args.join(" ");
        if (nestedCommand) {
          if (depth >= 4) {
            return "nested eval commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      if (invocation && SHELL_COMMANDS.has(invocation.executable)) {
        const commandIndex = invocation.args.findIndex(
          (argument) => /^-[^-]*c/u.test(argument)
        );
        const nestedCommand = commandIndex >= 0 ? invocation.args[commandIndex + 1] : void 0;
        if (commandIndex >= 0 && nestedCommand) {
          if (depth >= 4) {
            return "nested shell -c commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      segment = [];
    }
  }
  return null;
}
function hasCommandSubstitution(command) {
  return /\$\(|`/u.test(command);
}
function nestedCommandSubstitutions(command) {
  const nested = [];
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (char === "`") {
      let end2 = index + 1;
      let body2 = "";
      for (; end2 < command.length; end2 += 1) {
        const escaped = command[end2];
        const escapedNext = command[end2 + 1];
        if (escaped === "\\" && escapedNext !== void 0) {
          body2 += escapedNext;
          end2 += 1;
        } else if (escaped === "`") break;
        else if (escaped !== void 0) body2 += escaped;
      }
      if (end2 < command.length) {
        nested.push(body2);
        index = end2;
      }
      continue;
    }
    if (char !== "$" || command[index + 1] !== "(") continue;
    let depth = 1;
    let body = "";
    let nestedQuote = null;
    let end = index + 2;
    for (; end < command.length && depth > 0; end += 1) {
      const current = command[end];
      if (current === void 0) continue;
      if (current === "\\") {
        const nextChar = command[end + 1];
        if (nextChar !== void 0) body += `${current}${nextChar}`;
        end += 1;
        continue;
      }
      if (nestedQuote) {
        if (current === nestedQuote) nestedQuote = null;
        body += current;
        continue;
      }
      if (current === "'" || current === '"') {
        nestedQuote = current;
        body += current;
        continue;
      }
      if (current === "(") depth += 1;
      if (current === ")") depth -= 1;
      if (depth > 0) body += current;
    }
    if (depth === 0) {
      nested.push(body);
      index = end - 1;
    }
  }
  return nested;
}
function dangerousCommandHits(command, cwd = process.cwd()) {
  if (typeof command !== "string" || !command) return [];
  const reason = dangerousCommandReason(command, cwd);
  return reason ? [reason] : [];
}
function dangerousCommandDenyMessage(hits, command = "") {
  const reasons = Array.isArray(hits) ? hits : [];
  return [
    "[Dangerous Command] High-risk command blocked",
    "",
    `Reason: ${reasons.join("; ") || "the command's deletion scope cannot be proven safe"}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The parsed shell command recursively deletes the filesystem root, home directory, workspace root, or an equivalently broad target.",
    "  harm: Running this command could irreversibly delete user data or the entire working environment.",
    "  unblockWhen: The deletion target resolves to a specific, narrow, verified path, or the destructive command is removed.",
    "  recovery: Resolve the target files first, prefer a recoverable move or trash operation, then retry with an explicit narrow path."
  ].join("\n");
}

// plugins/command-safety/src/entries/hooks/cmd-safety-hook-pre-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);
  const toolName = normalizeToolName(eventToolName(event));
  const toolInput = eventToolInput(event);
  const cwd = eventCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const { rules, settings } = resolveRules(userConfig);
  if (/^Read$/iu.test(toolName)) {
    if (settings.engines.secretRead !== false) {
      const tool = isRecord(event.tool) ? event.tool : null;
      const extraTargets = Array.isArray(tool?.fileTargets) ? tool.fileTargets : [];
      const report = secretReadReport(
        [
          toolInput.file_path,
          toolInput.filePath,
          toolInput.path,
          ...extraTargets
        ].filter(Boolean)
      );
      if (report) writeJson(additionalContextOutput("PreToolUse", report));
    }
    process.exit(0);
  }
  if (!isShellTool(toolName)) process.exit(0);
  const command = extractShellCommand(toolName, toolInput) ?? "";
  if (!command) process.exit(0);
  if (settings.engines.denyEscalation !== false) {
    const escalation = escalationMessage(event, command, settings.escalation);
    if (escalation) {
      writeJson(preToolDeny(escalation));
      process.exit(0);
    }
  }
  if (settings.engines.dangerousRm !== false) {
    const dangerousHits = dangerousCommandHits(command, cwd);
    if (dangerousHits.length > 0) {
      recordDeny(event, command, "dangerous-rm");
      writeJson(
        preToolDeny(dangerousCommandDenyMessage(dangerousHits, command))
      );
      process.exit(0);
    }
  }
  const hit = matchRule(command, rules);
  if (hit) {
    if (hit.mode === "allow") process.exit(0);
    if (hit.mode === "deny") {
      recordDeny(event, command, hit.id || "command-rule");
      writeJson(preToolDeny(formatFinding(hit, command)));
      process.exit(0);
    }
    if (hit.mode === "report") {
      writeJson(
        additionalContextOutput("PreToolUse", formatFinding(hit, command))
      );
      process.exit(0);
    }
  }
  if (settings.engines.mysqlReplicationPreflight !== false) {
    const mysql = mysqlReplicationPreflightFinding(command, event);
    if (mysql) {
      recordDeny(event, command, mysql.id);
      writeJson(preToolDeny(mysqlPreflightDenyMessage(mysql, command)));
      process.exit(0);
    }
  }
}
main().catch(() => process.exit(0));
