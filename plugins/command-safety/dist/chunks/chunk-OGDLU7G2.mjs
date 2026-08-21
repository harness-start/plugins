// harness-source-hash: sha256:374c0be14b618ec0790b1b4c34a372368bd3d321c1f8d52a982b49a940b196db

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";

// core/src/state-file.ts
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

// core/src/hook-targets.ts
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
var PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath"
];
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}
function isReadTool(name) {
  return READ_TOOLS.has(canonicalToolName(name));
}
function isShellTool(name) {
  return SHELL_TOOLS.has(canonicalToolName(name));
}
function extractShellCommand(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = input;
  const paths = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchPaths(payload) {
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function patchPayload(input) {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function resolveTargets(raw, cwd) {
  return [...new Set(
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
  )];
}
function shellWritePaths(command) {
  const paths = [];
  const push = (raw) => {
    const value = stripMatchingQuotes(String(raw ?? ""));
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  return paths;
}
function acceptsTool(name, tools) {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}
function extractFileTargets(event, options = {}) {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve(eventCwd(event));
  const input = eventToolInput(event);
  const raw = [];
  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }
  if (options.includeShellWrites) {
    const command = extractShellCommand(event) ?? (typeof input.command === "string" ? input.command : null) ?? (typeof input.cmd === "string" ? input.cmd : null) ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }
  return resolveTargets(raw, cwd);
}

// plugins/command-safety/src/lib/hook-io.ts
function extractShellCommand2(toolName, toolInput) {
  return extractShellCommand({ tool_name: toolName, tool_input: toolInput });
}
function extractWriteTargets(toolNameOrEvent, toolInput) {
  const event = toolInput === void 0 ? toolNameOrEvent : { tool_name: toolNameOrEvent, tool_input: toolInput, cwd: process.cwd() };
  return extractFileTargets(event, { tools: "any", includeShellWrites: true });
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT)
  });
}

// plugins/command-safety/src/lib/rule-engine.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/command-safety/src/lib/builtin-rules.ts
import { createHash } from "node:crypto";

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
  const lines = [];
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
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  return lines;
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

// plugins/command-safety/src/lib/builtin-rules.ts
function fileAwareEditRecovery(host) {
  if (host === "codex") {
    return "Use apply_patch for new or existing files so path guards and verification hooks can observe the change.";
  }
  if (host === "claude") {
    return "Use Write for new files or Edit for existing files so path guards and verification hooks can observe the change.";
  }
  return "Use the host's file-aware editing tool so path guards and verification hooks can observe the change.";
}
var SQL_CLIENTS = /* @__PURE__ */ new Set([
  "mysql",
  "mariadb",
  "mysqlsh",
  "mycli",
  "psql",
  "pgcli",
  "cockroach",
  "sqlite3",
  "litecli",
  "duckdb",
  "clickhouse",
  "clickhouse-client",
  "sqlcmd",
  "usql",
  "snowsql",
  "trino",
  "presto",
  "mongosh",
  "mongo"
]);
function programInvocations(command, programs) {
  return shellCommandInvocations(command).filter(
    (invocation) => programs.has(invocation.executable.toLowerCase())
  );
}
function digest(command) {
  return createHash("sha256").update(command).digest("hex").slice(0, 16);
}
function cleanedSql(command) {
  return tokenizeShell(command).join(" ").replace(/--(?=\s|$)[^\n]*/gu, "").replace(/\/\*[\s\S]*?\*\//gu, "");
}
function isTempPathOperand(token) {
  const value = String(token ?? "");
  return /^(?:\/tmp\/|\/private\/tmp\/|\$\{?TMPDIR\}?\/)/u.test(value);
}
function sedFileOperands(args) {
  const files = [];
  let sawExpression = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
      sawExpression = true;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) continue;
    if (!sawExpression) {
      sawExpression = true;
      continue;
    }
    files.push(argument);
  }
  return files;
}
function sedHasUnbackedInplace(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--in-place") return true;
    if (argument.startsWith("--in-place=")) continue;
    const short = argument.match(/^-[A-Za-z]*i(.*)$/u);
    if (!short) continue;
    if (short[1]) continue;
    if (args[index + 1] === "") continue;
    return true;
  }
  return false;
}
function sedInplaceReason(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["sed"]));
  for (const { args } of invocations) {
    if (!sedHasUnbackedInplace(args)) continue;
    const files = sedFileOperands(args);
    if (files.length > 0 && files.every((file) => isTempPathOperand(file))) {
      continue;
    }
    return "sed -i modifies files in place without a backup and cannot be rolled back";
  }
  return null;
}
var CAT_HEREDOC_WRITE_RE = /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;
function isCatHeredocWrite(command) {
  return CAT_HEREDOC_WRITE_RE.test(command);
}
function isCatPipeInput(command) {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}
function isCatTmpRedirect(command) {
  return /(?:>|>>)\s*(?:\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/.test(
    command
  );
}
function redisOperation(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["redis-cli"]));
  for (const { args } of invocations) {
    const match = args.join(" ").match(
      /\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu
    );
    const operation = match?.[0];
    if (operation) return operation.toUpperCase();
  }
  return null;
}
function sqlDestructiveReason(command) {
  const blocks = [
    [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP permanently deletes a database object"],
    [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE removes all table data"],
    [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN permanently deletes column data"],
    [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE is missing WHERE"],
    [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE is missing WHERE"]
  ];
  for (const { args } of programInvocations(command, SQL_CLIENTS)) {
    const cleaned = cleanedSql(args.join(" "));
    for (const [pattern, reason] of blocks) {
      if (pattern.test(cleaned)) return reason;
    }
  }
  return null;
}
function sqlPrivilegeHit(command) {
  return programInvocations(command, SQL_CLIENTS).some(
    ({ args }) => /\b(?:GRANT|REVOKE)\b/iu.test(cleanedSql(args.join(" ")))
  );
}
function activeTestReason(command) {
  for (const { executable, args } of shellCommandInvocations(command)) {
    const program = executable.toLowerCase();
    const subject = args.join(" ");
    if (["masscan", "zmap"].includes(program)) {
      return "the high-speed internet-wide scanner has no auditable boundary";
    }
    if (["hping", "hping3"].includes(program) && /--flood\b/u.test(subject)) {
      return "flood mode is prohibited";
    }
    if (program === "nmap") {
      const cidr = subject.match(/\S+\/(\d{1,2})\b/u);
      const cidrBits = cidr?.[1];
      if (cidrBits !== void 0 && Number(cidrBits) <= 20) {
        return `target range /${cidrBits} exceeds the /21 limit`;
      }
      if (/(?:^|\s)-p-(?:\s|$)/u.test(subject) && !/--max-rate(?:=|\s+)\d+/u.test(subject)) {
        return "the all-port scan is missing --max-rate";
      }
    }
    if (["ffuf", "gobuster", "feroxbuster"].includes(program) && !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(subject)) {
      return "content enumeration is missing a rate or thread limit";
    }
  }
  return null;
}
function secretLeakHit(command) {
  return shellCommandInvocations(command).some(secretLeakInvocationHit);
}
function secretLeakInvocationHit({ executable, args }) {
  const program = executable.toLowerCase();
  const subject = args.join(" ");
  if (["cat", "head", "tail", "less", "more", "bat"].includes(program)) {
    return /(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(
      subject
    );
  }
  if (["curl", "wget", "http"].includes(program)) {
    return /(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(
      subject
    );
  }
  if (program === "apksigner") {
    return /(?:--ks-pass|--key-pass)(?:=|\s+)pass:/iu.test(subject);
  }
  if (program === "base64") {
    return /(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)/iu.test(subject);
  }
  if (program === "echo") {
    return /\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(subject);
  }
  return false;
}
var BUILTIN_RULES = [
  {
    id: "sed-inplace",
    title: "sed -i Guard",
    mode: "deny",
    match: { test: (command) => Boolean(sedInplaceReason(command)) },
    resolveReason: (command) => sedInplaceReason(command) ?? "sed in-place editing has no recoverable backup",
    recovery: "Use Edit/apply_patch for replacements; if sed is required, create an explicit recoverable backup first. Unbacked sed -i under /tmp, /private/tmp, or $TMPDIR/ is allowed.",
    observedFacts: "The Bash input contains sed --in-place or bare sed -i without a backup suffix on a non-temporary path.",
    harm: "In-place rewrites are difficult to review or recover and bypass file-aware editing hooks.",
    unblockWhen: "Target only temporary paths (/tmp/\u2026, $TMPDIR/\u2026), use a backup suffix, or use a file-aware editing tool."
  },
  {
    id: "cat-heredoc-repo-write",
    title: "Cat Write Guard",
    mode: "deny",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && !isCatTmpRedirect(command)
    },
    reason: "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks",
    recovery: "Use the host's file-aware editing tool.",
    observedFacts: "The Bash input contains a cat heredoc redirected to a non-temporary file.",
    harm: "The write bypasses file-aware target checks, change hooks, and post-write verification.",
    unblockWhen: "The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
    formatMessage: (command, host) => [
      "[Cat Write Guard] cat heredoc file write blocked",
      "",
      "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks:",
      "  \u2022 syntax checkers do not run",
      "  \u2022 line-budget checks are outside this command-safety responsibility",
      "  \u2022 encoding guards do not check encoding",
      "  \u2022 path guards do not check the write target",
      "",
      `Command: ${command}`,
      "",
      `Alternative: ${fileAwareEditRecovery(host)}`,
      "",
      "blockingContract:",
      "  observedFacts: The Bash input contains a cat heredoc redirected to a non-temporary file.",
      "  harm: The write bypasses file-aware target checks, change hooks, and post-write verification.",
      "  unblockWhen: The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
      `  recovery: ${fileAwareEditRecovery(host)}`
    ].join("\n")
  },
  {
    id: "cat-heredoc-tmp-write",
    title: "Cat Write Guard",
    mode: "report",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && isCatTmpRedirect(command)
    },
    reason: "Writing a temporary file with a Bash cat heredoc does not trigger file-aware PostToolUse checks",
    recovery: "Temporary scripts may proceed, but prefer the host's file-aware editing tool.",
    formatMessage: (command, host) => [
      "[Cat Write Guard] cat heredoc temporary-file write detected",
      "",
      "Writing a file with a Bash cat heredoc does not trigger file-aware PostToolUse checks.",
      `Temporary scripts may proceed. ${fileAwareEditRecovery(host)}`,
      `Command: ${command}`
    ].join("\n")
  },
  {
    id: "redis-cli-risk",
    title: "Redis CLI Risk",
    mode: "deny",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["KEYS", "MONITOR", "FLUSHALL", "FLUSHDB"].includes(op)
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} scans, blocks, or clears Redis data`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first",
    observedFacts: "The command matches a high-risk Redis CLI operation.",
    harm: "It may cause data loss or block the instance.",
    unblockWhen: "Use an auditable narrow-scope operation or declare a precise allow rule in configuration."
  },
  {
    id: "redis-cli-pressure",
    title: "Redis CLI Risk",
    mode: "report",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["DEL", "RANDOMKEY", "SETBIT", "BGSAVE", "BGREWRITEAOF"].includes(
            op
          )
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} may block the main thread or increase instance resource pressure`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first"
  },
  {
    id: "sql-destructive",
    title: "Dangerous SQL",
    mode: "deny",
    match: { test: (command) => Boolean(sqlDestructiveReason(command)) },
    resolveReason: (command) => sqlDestructiveReason(command) ?? "dangerous SQL",
    recovery: "Add an explicit WHERE clause or complete backup, authorization, and recovery verification first",
    observedFacts: "The SQL client command matches a destructive change or a mutation without WHERE.",
    harm: "It may permanently delete database objects or remove data in bulk.",
    unblockWhen: "Add WHERE, backup, and authorization before executing."
  },
  {
    id: "sql-privilege",
    title: "SQL Notice",
    mode: "report",
    match: { test: (command) => sqlPrivilegeHit(command) },
    reason: "database privileges will change",
    recovery: "Confirm the target user, least-privilege scope, and rollback statement"
  },
  {
    id: "active-test-unbounded",
    title: "Security Active Test Scope Guard",
    mode: "deny",
    match: { test: (command) => Boolean(activeTestReason(command)) },
    resolveReason: (command) => activeTestReason(command) ?? "active security testing lacks an auditable boundary",
    recovery: "Use an explicit target and bounded rate",
    observedFacts: "The active security testing command lacks an auditable boundary.",
    harm: "It may scan outside the authorized scope or overload resources.",
    unblockWhen: "Declare the target scope and rate or thread limit."
  },
  {
    id: "secret-leak",
    title: "Secret Leak Notice",
    mode: "report",
    match: { test: (command) => secretLeakHit(command) },
    resolveReason: (command) => `The command may read, print, or transmit sensitive credentials (digest ${digest(command)})`,
    recovery: "Read only required fields, never echo or exfiltrate them, and use environment references and secure credential channels",
    sensitive: true
  },
  {
    id: "lark-yes",
    title: "Lark CLI Confirmation Audit",
    mode: "report",
    match: {
      test: (command) => programInvocations(command, /* @__PURE__ */ new Set(["lark-cli"])).some(
        ({ args }) => args.includes("--yes")
      )
    },
    reason: "non-interactive --yes confirmation detected",
    recovery: "Confirm the target resource, write/delete scope, recoverable copy, and read-back verification",
    sensitive: true
  }
];

// plugins/command-safety/src/lib/sanitize-command.ts
function sanitizeCommand(command) {
  if (typeof command !== "string" || !command) return "";
  let stripped = command.replace(
    /\$\(cat\s+<<'?(\w+)'?\n[\s\S]*?\n\1\s*\)/g,
    " __HEREDOC__ "
  );
  stripped = stripped.replace(
    /\bgit\s+commit\b[^;|&]*/g,
    (commitCommand) => commitCommand.replace(/-m\s+"(?:[^"\\]|\\.)*"/g, '-m "__MSG__"').replace(/-m\s+'[^']*'/g, "-m '__MSG__'")
  );
  return stripped;
}

// plugins/command-safety/src/lib/rule-engine.ts
var CONFIG_FILE_NAMES = [
  ".command-safety.mjs",
  ".command-safety.cjs",
  ".command-safety.js"
];
var DEFAULT_SETTINGS = {
  engines: {
    dangerousRm: true,
    verificationIntegrity: true,
    mysqlReplicationPreflight: true,
    secretRead: true,
    fileSafety: true,
    denyEscalation: true
  },
  escalation: {
    windowMinutes: 10,
    threshold: 3
  }
};
function isMatcher(value) {
  return value instanceof RegExp || isRecord(value) && typeof value.test === "function";
}
function testMatcher(matcher, subject) {
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source, matcher.flags).test(subject);
  }
  return matcher.test(subject);
}
function isRuleMode(value) {
  return value === "deny" || value === "report" || value === "allow";
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function resolveEngineSettings(raw) {
  const engines = { ...DEFAULT_SETTINGS.engines };
  if (!isRecord(raw)) return engines;
  if (typeof raw.verificationIntegrity === "boolean") {
    engines.verificationIntegrity = raw.verificationIntegrity;
  }
  if (typeof raw.mysqlReplicationPreflight === "boolean") {
    engines.mysqlReplicationPreflight = raw.mysqlReplicationPreflight;
  }
  if (typeof raw.secretRead === "boolean") engines.secretRead = raw.secretRead;
  if (typeof raw.fileSafety === "boolean") engines.fileSafety = raw.fileSafety;
  return engines;
}
function resolveEscalationSettings(_raw) {
  return { ...DEFAULT_SETTINGS.escalation };
}
function validateRule(rule, i) {
  if (!rule || typeof rule !== "object") {
    process.stderr.write(
      `[command-safety] rule[${i}]: must be an object, skipping
`
    );
    return false;
  }
  if (!("match" in rule) || !(rule.match instanceof RegExp)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "match" must be a RegExp, skipping
`
    );
    return false;
  }
  const mode = "mode" in rule ? rule.mode ?? "deny" : "deny";
  if (!isRuleMode(mode)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "mode" must be deny|report|allow, skipping
`
    );
    return false;
  }
  return true;
}
function resolveRules(userConfig) {
  const config = isRecord(userConfig) ? userConfig : {};
  const rawUser = Array.isArray(config.rules) ? config.rules : [];
  if (config.rules !== void 0 && !Array.isArray(config.rules)) {
    process.stderr.write(
      `[command-safety] config "rules" must be an array, using built-ins
`
    );
  }
  const userRules = rawUser.map((rule, i) => ({ rule, i })).filter((item) => validateRule(item.rule, item.i)).map(({ rule, i }) => {
    const mode = isRuleMode(rule.mode) ? rule.mode : "deny";
    return {
      id: typeof rule.id === "string" && rule.id ? rule.id : `user-rule[${i}]`,
      match: rule.match,
      mode,
      title: optionalString(rule.title),
      reason: optionalString(rule.reason),
      recovery: optionalString(rule.recovery),
      observedFacts: optionalString(rule.observedFacts),
      harm: optionalString(rule.harm),
      unblockWhen: optionalString(rule.unblockWhen),
      sensitive: Boolean(rule.sensitive)
    };
  });
  const settingsSource = isRecord(config.settings) ? config.settings : null;
  return {
    rules: [...userRules, ...BUILTIN_RULES],
    settings: {
      engines: resolveEngineSettings(settingsSource?.engines),
      escalation: resolveEscalationSettings(settingsSource?.escalation)
    }
  };
}
function matchRule(command, rules, options = {}) {
  const { sanitize = true } = options;
  if (typeof command !== "string" || !command) return null;
  const subject = sanitize ? sanitizeCommand(command) : command;
  for (const rule of rules) {
    if (!isMatcher(rule.match)) continue;
    try {
      if (testMatcher(rule.match, subject)) return rule;
    } catch {
      continue;
    }
  }
  return null;
}
function resolveReason(rule, command) {
  if (typeof rule.resolveReason === "function") {
    return rule.resolveReason(command);
  }
  return rule.reason || `matched rule ${rule.id}`;
}
function formatFinding(rule, command, options = {}) {
  if (typeof rule.formatMessage === "function") {
    return rule.formatMessage(command, options.host);
  }
  const title = rule.title || rule.id || "Command Safety";
  const reason = resolveReason(rule, command);
  const recovery = rule.recovery || "Adjust the command and retry, or declare an allow rule in the project configuration.";
  if (rule.mode === "report") {
    return [
      `[${title}] Risk notice`,
      "",
      `Reason: ${reason}`,
      `Recovery/alternative: ${recovery}`,
      `Command: ${command}`
    ].join("\n");
  }
  return [
    `[${title}] Blocked`,
    "",
    `Reason: ${reason}`,
    `Recovery/alternative: ${recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    `  observedFacts: ${rule.observedFacts || "The command matched a declarative command-safety rule."}`,
    `  harm: ${rule.harm || "It may cause data loss, out-of-scope testing, credential exposure, or unrecoverable changes."}`,
    `  unblockWhen: ${rule.unblockWhen || "Provide authorization, scope, backup, or a safe alternative, or add a precise allow rule."}`,
    `  recovery: ${recovery}`
  ].join("\n");
}
function resolveRepoRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      cwd
    }).trim();
  } catch {
    return null;
  }
}
async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      if (!isRecord(loaded)) return loaded;
      return loaded.default ?? loaded;
    } catch (error) {
      const message = isRecord(error) && error.message != null ? String(error.message) : String(error);
      process.stderr.write(
        `[command-safety] Failed to load ${name}: ${message}
`
      );
      return null;
    }
  }
  return null;
}

export {
  isRecord,
  readStdinJson,
  eventCwd,
  eventToolName,
  eventToolInput,
  preToolDeny,
  writeJson,
  extractShellCommand2 as extractShellCommand,
  extractWriteTargets,
  additionalContextOutput,
  commandInvocation,
  tokenizeShell,
  splitShellLogicalLines,
  shellCommandInvocations,
  sanitizeCommand,
  resolveRules,
  matchRule,
  formatFinding,
  resolveRepoRoot,
  loadUserConfig
};
