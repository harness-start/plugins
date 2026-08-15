#!/usr/bin/env node
// harness-source-hash: sha256:fb81e425a483b4db1bc2dd922973fe66fa76fb67ed28267897d54577a31862fe
import {
  additionalContextOutput,
  extractCwd,
  extractToolInput,
  extractWriteTargets,
  loadUserConfig,
  readStdinJson,
  resolveRepoRoot,
  resolveRules,
  writeJson
} from "../chunks/chunk-QMTVST3Y.mjs";

// plugins/command-safety-guards/src/entries/hooks/cmd-safety-hook-post-tool.ts
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

// plugins/command-safety-guards/src/engines/file-safety.ts
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
var TLS = [/\bInsecureSkipVerify\s*:\s*true\b/u, /\brejectUnauthorized\s*:\s*false\b/u, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/u, /\bverify\s*=\s*False\b/u, /\bssl\.CERT_NONE\b/u, /\b_create_unverified_context\s*\(/u, /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*(?:=>|,)\s*(?:false|0|0L)\b/iu, /\bdanger_accept_invalid_certs\s*\(\s*true\s*\)/u, /\bOpenSSL::SSL::VERIFY_NONE\b/u];
var LOG = /(?:logger|log|logging|slog|zap|zerolog|logrus|fmt)\s*\.\s*\w+\s*\(|console\s*\.\s*(?:log|info|warn|error|debug)\s*\(|fmt\.(?:Print|Println|Printf|Fprintf|Sprintf)\s*\(|print(?:f|ln)?\s*\(/iu;
var PII = /(?<!['"` ])\b(?:email|phone|mobile|tel(?:ephone)?|password|passwd|secret|token|api[_-]?key|ssn|national[_-]?id|credit[_-]?card|cvv|birth(?:day|date)|身份证|手机号|邮箱|密码|证件号)\b(?!['"`])/iu;
var SOURCE = /* @__PURE__ */ new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".scala", ".go", ".rs", ".php", ".rb", ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".cs"]);
function read(path) {
  try {
    const bytes = readFileSync(path);
    return bytes.length <= 2 * 1024 * 1024 ? { text: bytes.toString("utf8") } : null;
  } catch {
    return null;
  }
}
function count(text, predicate) {
  return text.split("\n").filter(predicate).length;
}
function testPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return /\/(?:tests?|spec|__tests__|__mocks__|fixtures?|testdata|e2e)\//u.test(normalized) || /\.(?:test|spec|e2e)\.[^.]+$/u.test(basename(path));
}
function fileSafetyReports(path, input = {}) {
  const content = read(path);
  if (!content) return [];
  const extension = extname(path).toLowerCase(), reports = [];
  if (!SOURCE.has(extension) || testPath(path)) return reports;
  const newText = typeof input.new_string === "string" ? input.new_string : content.text, oldText = typeof input.old_string === "string" ? input.old_string : "";
  const tlsLine = (line) => !/^\s*(?:\/\/|#|\/\*|\*)/u.test(line) && !/(?:原因).*?(?:expires|ticket|issue|#\d|过期|到期)/iu.test(line) && TLS.some((pattern) => pattern.test(line));
  const tls = count(newText, tlsLine) - count(oldText, tlsLine);
  if (tls > 0) reports.push(`[Insecure TLS Notice] ${path}: ${tls} net-new TLS verification bypass(es); use a trusted CA or a ticketed, expiring exception`);
  const normalized = path.toLowerCase().replaceAll("\\", "/");
  if (!/\/(?:sanitiz|redact|mask|anonymiz|obfuscat)/u.test(normalized)) {
    const piiLine = (line) => LOG.test(line) && PII.test(line);
    const pii = count(newText, piiLine) - count(oldText, piiLine);
    if (pii > 0) reports.push(`[Log PII Notice] ${path}: ${pii} net-new log call(s) contain direct PII variables; redact or log a non-sensitive identifier`);
  }
  return reports;
}

// plugins/command-safety-guards/src/entries/hooks/cmd-safety-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const { settings } = resolveRules(userConfig);
  if (settings.engines.fileSafety === false) return;
  const input = extractToolInput(event);
  const reports = extractWriteTargets(event).map((path) => isAbsolute(path) ? path : resolve(cwd, path)).filter(existsSync).flatMap((path) => fileSafetyReports(path, input));
  if (reports.length) {
    writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}
main().catch(() => process.exit(0));
