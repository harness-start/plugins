import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";

const CPP_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".inl", ".ipp", ".tpp", ".ixx", ".cppm"]);
const ENCODING_EXTENSIONS = new Set([...CPP_EXTENSIONS, ".cs", ".r", ".rb"]);

function read(filePath) {
  try { const bytes = readFileSync(filePath); return bytes.length <= 2 * 1024 * 1024 ? { bytes, text: bytes.toString("utf8") } : null; }
  catch { return null; }
}

function optional(command, args, cwd = undefined) {
  try { execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }); return { available: true, output: null }; }
  catch (error) {
    if (["ENOENT", "EACCES"].includes(error?.code)) return { available: false, output: null };
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.trim();
    return { available: true, output: output ? output.split("\n").slice(0, 12).join("\n") : null };
  }
}

function bracketIssues(text) {
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let quote = null, escaped = false, line = 1, blockComment = false, lineComment = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === "\n") { line += 1; lineComment = false; }
    if (lineComment) continue;
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (!quote && char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (!quote && char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (quote) { if (!escaped && char === quote) quote = null; escaped = !escaped && char === "\\"; if (char !== "\\") escaped = false; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ("([{ ".includes(char) && char !== " ") stack.push({ char, line });
    if (pairs[char]) { const open = stack.pop(); if (!open || open.char !== pairs[char]) return [`L${line}: unmatched ${char}`]; }
  }
  return stack.length ? [`L${stack.at(-1).line}: unmatched ${stack.at(-1).char}`] : blockComment ? ["unclosed block comment"] : quote ? ["unclosed string literal"] : [];
}

function cppReports(filePath, text, toolInput) {
  const reports = [];
  const extension = extname(filePath).toLowerCase();
  if ([".c", ".cc", ".cpp", ".cxx"].includes(extension)) {
    let result = optional("clang", ["-fsyntax-only", "-w", filePath]);
    if (!result.available) result = optional(extension === ".c" ? "gcc" : "g++", ["-fsyntax-only", "-w", filePath]);
    if (result.output && !/fatal error:.*(?:file not found|no such file)/iu.test(result.output)) reports.push(`[C/C++ Syntax] ${result.output}`);
    if (!result.available) { const issues = bracketIssues(text); if (issues.length) reports.push(`[C/C++ Bracket Check] ${filePath}: ${issues.join(", ")}`); }
  } else {
    const issues = bracketIssues(text); if (issues.length) reports.push(`[C/C++ Bracket Check] ${filePath}: ${issues.join(", ")}`);
  }
  const normalized = filePath.replaceAll("\\", "/");
  const testFile = /\/(?:tests?|testdata|fixtures|benchmarks)\//u.test(normalized) || /(?:_test|_spec|\.test|\.spec)\.(?:c|cc|cpp|cxx|h|hpp)$/iu.test(basename(filePath));
  if (!testFile) {
    const source = typeof toolInput?.new_string === "string" ? toolInput.new_string : text;
    const baseline = typeof toolInput?.old_string === "string" ? toolInput.old_string : "";
    const patterns = [/\bprintf\s*\(\s*"[^"\n]*\bdebug\b/iu, /\bputs\s*\(\s*"[^"\n]*\bdebug\b/iu, /\b(?:std::)?(?:cerr|clog)\s*<</u];
    const count = (value, pattern) => value.split("\n").filter((line) => !/^\s*(?:\/\/|\/\*|\*)/u.test(line) && pattern.test(line)).length;
    const added = patterns.reduce((sum, pattern) => sum + Math.max(0, count(source, pattern) - count(baseline, pattern)), 0);
    if (added) reports.push(`[C/C++ Debug Statement] ${filePath}: ${added} net-new temporary debug output candidate(s)`);
  }
  return reports;
}

function windowsEncoding(filePath, bytes) {
  if (process.platform !== "win32" || bytes.length === 0) return null;
  const extension = extname(filePath).toLowerCase();
  if (![".bat", ".cmd", ".ps1", ".psm1", ".reg"].includes(extension)) return null;
  const utf8Bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  const utf16Bom = bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]));
  const nonAscii = bytes.some((byte, index) => index >= (utf8Bom ? 3 : utf16Bom ? 2 : 0) && byte > 0x7f);
  if (!nonAscii) return null;
  if ([".bat", ".cmd"].includes(extension)) return "non-ASCII batch content must match the active cmd code page";
  if ([".ps1", ".psm1"].includes(extension) && !utf8Bom) return "Windows PowerShell 5.1 may decode non-ASCII UTF-8 without BOM as ANSI";
  if (extension === ".reg" && !utf16Bom) return "non-ASCII .reg files should use UTF-16LE with BOM";
  return null;
}

export function miscFileReports(filePath, toolInput = {}) {
  const content = read(filePath); if (!content) return [];
  const extension = extname(filePath).toLowerCase();
  const reports = [];
  if (ENCODING_EXTENSIONS.has(extension) && (content.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || content.text.includes("\uFFFD"))) reports.push(`[Encoding Guard] ${filePath}: BOM or invalid UTF-8 detected`);
  if (CPP_EXTENSIONS.has(extension)) reports.push(...cppReports(filePath, content.text, toolInput));
  if ([".ex", ".exs"].includes(extension)) { const result = optional("elixir", ["-e", "Code.string_to_quoted!(File.read!(hd(System.argv())))", "--", filePath], dirname(filePath)); if (result.output) reports.push(`[Elixir Syntax] ${result.output}`); }
  if (extension === ".sol") { const result = optional("solc", ["--no-color", "--no-compile", filePath], dirname(filePath)); if (result.output && !/^Warning:/mu.test(result.output)) reports.push(`[Solidity Syntax] ${result.output}`); }
  const windows = windowsEncoding(filePath, content.bytes); if (windows) reports.push(`[Windows Script Encoding] ${filePath}: ${windows}`);
  return reports;
}
