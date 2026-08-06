import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

function read(filePath) {
  try {
    const bytes = readFileSync(filePath);
    if (bytes.length > 2 * 1024 * 1024) return null;
    return { bytes, text: bytes.toString("utf8") };
  } catch { return null; }
}

function runOptional(command, args, timeout = 8000) {
  try {
    execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"], timeout });
    return { available: true, output: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { available: false, output: null };
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.trim();
    return { available: true, output: output || `${error?.message ?? "unknown error"}` };
  }
}

function limited(output) {
  return output.split("\n").slice(0, 20).join("\n");
}

function isHelmTemplate(filePath, text) {
  const normalized = filePath.replaceAll("\\", "/");
  return /\{\{[\s\S]*?\}\}/u.test(text) && (
    normalized.includes("/templates/") ||
    /\{\{[-\s]*(?:\.Values|\.Release|\.Chart|\.Capabilities|\.Files|include|template|tpl|required|lookup)\b/u.test(text)
  );
}

function checkYaml(filePath, text) {
  if (isHelmTemplate(filePath, text)) return null;
  const ruby = runOptional("ruby", ["-e", 'require "psych"; Psych.parse_stream(File.read(ARGV[0], encoding: "UTF-8"))', filePath], 10000);
  if (ruby.available) return ruby.output;
  const script = [
    "import sys",
    "from pathlib import Path",
    "try:",
    " import yaml",
    "except ImportError:",
    " sys.exit(0)",
    "with Path(sys.argv[1]).open('r', encoding='utf-8') as fh:",
    " list(yaml.safe_load_all(fh))",
  ].join("\n");
  const python3 = runOptional("python3", ["-c", script, filePath], 10000);
  if (python3.available) return python3.output;
  return runOptional("python", ["-c", script, filePath], 10000).output;
}

function dockerfileReports(filePath, text) {
  const hadolint = runOptional("hadolint", [filePath]);
  if (hadolint.available) return hadolint.output ? [`[hadolint] ${limited(hadolint.output)}`] : [];
  const issues = [];
  if (!/^\s*FROM\s+\S+/imu.test(text)) issues.push("add a FROM instruction");
  if (/^FROM\s+\S+:latest/imu.test(text)) issues.push("avoid the :latest tag");
  if (/^ADD\s+https?:\/\//imu.test(text)) issues.push("use RUN with curl/wget instead of ADD URL");
  if (/^RUN\s+.*apt-get\s+install\b/imu.test(text) && !/rm\s+-rf\s+\/var\/lib\/apt\/lists/iu.test(text)) issues.push("clean /var/lib/apt/lists after apt-get install");
  if (/^ADD\s+(?!https?:\/\/)(?!.*\.(?:tar|gz|bz2|xz)\b)\S+/imu.test(text)) issues.push("use COPY for local files that do not need extraction");
  return issues.length ? [`[Dockerfile] ${filePath}: ${issues.join("; ")}`] : [];
}

function shellReports(filePath, text, shell) {
  const reports = [];
  const syntax = runOptional(shell, ["-n", filePath], 5000);
  if (syntax.output) reports.push(`[${shell} Syntax] ${limited(syntax.output)}`);
  if (shell !== "bash") return reports;
  const shellcheck = runOptional("shellcheck", ["--severity=warning", "--format=gcc", filePath]);
  if (shellcheck.output) reports.push(`[ShellCheck] ${limited(shellcheck.output)}`);
  const code = text.split("\n").slice(0, 30).map((line) => line.replace(/#.*$/u, "").trim()).filter(Boolean).join("\n");
  const compact = /\bset\s+-[Eeuo]*e[Eeuo]*u[Eeuo]*o\s+pipefail\b/u.test(code) || /\bset\s+-[Eeuo]*u[Eeuo]*e[Eeuo]*o\s+pipefail\b/u.test(code);
  const split = /\bset\s+.*-[^ ]*e/u.test(code) && /\bset\s+.*-[^ ]*u/u.test(code) && /\bset\s+-o\s+pipefail\b/u.test(code);
  if (!compact && !split) reports.push(`[Defensive Bash] ${filePath}: add set -euo pipefail near the start of the script`);
  return reports;
}

export function infrastructureFileReports(filePath) {
  const content = read(filePath);
  if (!content) return [];
  const extension = extname(filePath).toLowerCase();
  const name = basename(filePath);
  const reports = [];
  if (content.bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || content.text.includes("\uFFFD")) reports.push(`[Infrastructure Encoding Guard] ${filePath}: BOM or invalid UTF-8 detected`);
  if ([".yaml", ".yml"].includes(extension)) {
    const yamlError = checkYaml(filePath, content.text);
    if (yamlError) reports.push(`[YAML Syntax] ${limited(yamlError)}`);
    const normalized = filePath.replaceAll("\\", "/");
    if (normalized.includes("/.github/workflows/")) {
      const actionlint = runOptional("actionlint", ["-no-color", filePath]);
      if (actionlint.output) reports.push(`[actionlint] ${limited(actionlint.output)}`);
    }
    if (!/\{\{[\s\S]*?\}\}/u.test(content.text) && /^apiVersion:\s*\S+/mu.test(content.text) && /^kind:\s*\S+/mu.test(content.text)) {
      const kubeconform = runOptional("kubeconform", [filePath]);
      if (kubeconform.output) reports.push(`[kubeconform] ${limited(kubeconform.output)}`);
    }
  }
  if (/^(?:Dockerfile(?:\..+)?|.+\.dockerfile)$/iu.test(name)) reports.push(...dockerfileReports(filePath, content.text));
  if ([".sh", ".bash", ".zsh"].includes(extension) || ["bashrc", "zshrc"].includes(name)) {
    const shell = extension === ".zsh" || name === "zshrc" ? "zsh" : "bash";
    reports.push(...shellReports(filePath, content.text, shell));
  }
  if ([".tf", ".tfvars"].includes(extension)) {
    const terraform = runOptional("terraform", ["fmt", "-check", "-diff", filePath]);
    if (terraform.output) reports.push(`[terraform fmt] ${limited(terraform.output)}`);
  }
  const debt = content.text.match(/(?:#\s*(?:TODO|FIXME|HACK)|\b(?:0\.0\.0\.0\/0|privileged:\s*true|latest)\b)/giu) ?? [];
  if (debt.length) reports.push(`[IaC Debt Guard] ${filePath}: ${[...new Set(debt)].slice(0, 8).join(", ")}`);
  return reports;
}
