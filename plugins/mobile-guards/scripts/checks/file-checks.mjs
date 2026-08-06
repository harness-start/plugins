import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

function read(filePath) {
  try {
    const bytes = readFileSync(filePath);
    if (bytes.length > 2 * 1024 * 1024) return null;
    return { bytes, text: bytes.toString("utf8") };
  } catch { return null; }
}

function runDart(filePath) {
  const candidates = [join(dirname(filePath), ".fvm", "flutter_sdk", "bin", "dart"), "dart"];
  for (const command of candidates) {
    try {
      execFileSync(command, ["analyze", filePath], { cwd: dirname(filePath), stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
      return null;
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.trim();
      if (!output || output.includes("No issues found")) return null;
      return `[Dart Analyze] ${output.split("\n").slice(0, 8).join("\n")}`;
    }
  }
  return null;
}

function swiftReports(filePath, bytes, text) {
  const reports = [];
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || text.includes("\uFFFD")) reports.push(`[iOS Encoding Guard] ${filePath}: BOM or invalid UTF-8 detected`);
  const disabled = new Set();
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/\/\/\s*concurrency-guard:\s*disable\s+([\w,\-\s]+)/u);
    if (match) for (const id of match[1].split(",")) disabled.add(id.trim());
  }
  const rules = [
    ["CC-CONC-001", /Task\s*\.\s*detached/u, "Task.detached escapes structured concurrency; prefer a lifecycle-bound Task {}"],
    ["CC-CONC-W01", /nonisolated\s*\(\s*unsafe\s*\)/u, "nonisolated(unsafe) bypasses actor isolation"],
    ["CC-CONC-W02", /@unchecked\s+Sendable/u, "@unchecked Sendable bypasses compiler thread-safety checks"],
  ];
  const hits = [];
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || /\/\/\s*concurrency-guard:\s*allow\b/u.test(line)) continue;
    for (const [id, pattern, message] of rules) if (!disabled.has(id) && pattern.test(line)) hits.push(`L${index + 1}: [${id}] ${message}`);
  }
  if (hits.length) reports.push(`[Swift Concurrency Guard] ${filePath}\n${hits.join("\n")}`);
  return reports;
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function objcReports(filePath, text) {
  const findings = [];
  const block = /\^\s*(?:\([^\n)]*\)\s*)?\{/u.exec(text);
  if (block && (text.includes("self.") || text.includes("[self ")) && !["__weak", "weakSelf", "@weakify"].some((marker) => text.includes(marker))) findings.push(`L${lineAt(text, block.index)}: block and strong self reference without a weak-self marker`);
  const observer = text.indexOf("addObserver");
  if (observer >= 0 && !text.includes("removeObserver")) findings.push(`L${lineAt(text, observer)}: addObserver has no matching removeObserver in this file`);
  const queue = "dispatch_async(dispatch_get_global_queue";
  for (let offset = text.indexOf(queue); offset >= 0; offset = text.indexOf(queue, offset + queue.length)) {
    const window = text.slice(offset, offset + queue.length + 240);
    const ui = /\bUI[A-Z][A-Za-z]*\b|\bself\.view\b|\.\s*(?:text|attributedText|image|hidden|alpha|frame|bounds|backgroundColor)\s*=/u.exec(window);
    if (ui) findings.push(`L${lineAt(text, offset + ui.index)}: possible UIKit update from a global queue`);
  }
  return findings.length ? [`[ObjC/UIKit Pattern] ${filePath}\n${findings.slice(0, 8).join("\n")}`] : [];
}

export function mobileFileReports(filePath) {
  const content = read(filePath);
  if (!content) return [];
  const extension = extname(filePath).toLowerCase();
  if (extension === ".dart") {
    const report = runDart(filePath);
    return report ? [report] : [];
  }
  if (extension === ".swift") return swiftReports(filePath, content.bytes, content.text);
  if ([".m", ".mm"].includes(extension) && !basename(filePath).startsWith(".")) return objcReports(filePath, content.text);
  return [];
}
