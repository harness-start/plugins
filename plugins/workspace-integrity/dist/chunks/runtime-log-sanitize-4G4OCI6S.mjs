// harness-source-hash: sha256:9fbebb317a20b6e425ce30504bb183d58ba62162fc6c0b0a96104f7e8df73e32

// plugins/workspace-integrity/src/domains/commands/entries/cli/runtime-log-sanitize.ts
var MAX_INPUT_BYTES = 16 * 1024 * 1024;
function redactRuntimeLogs(input2) {
  return input2.replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/giu, "$1[REDACTED]").replace(
    /(\b(?:password|passwd|passphrase|token|secret|api[_-]?key|authorization)\b\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu,
    "$1[REDACTED]"
  ).replace(/(\b(?:https?|socks5?):\/\/[^\s:/@]+:)[^\s/@]+@/giu, "$1[REDACTED]@");
}
var input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > MAX_INPUT_BYTES) {
    process.stderr.write("[runtime-log-sanitize] input exceeds 16 MiB; bound the log query before retrying\n");
    process.exitCode = 2;
    input = "";
    break;
  }
}
if (input) process.stdout.write(redactRuntimeLogs(input));
