import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export const ROLES = new Set(["implementer", "spec-reviewer", "quality-reviewer", "final-reviewer", "researcher"]);
export const TERMINAL_STATUSES = new Set(["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"]);
const MARKER = /(?:^|\n)SUBAGENT_APPLICATION\s+([a-zA-Z0-9._-]{1,96})\s+([a-f0-9]{16,128})(?:\s|$)/u;
const SECRET = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[a-zA-Z0-9_-]{16,}\b|(?:password|passwd|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s]{8,})/iu;

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

export function normalizeWriteScope(value) {
  const clean = String(value).trim().replace(/^\.\//u, "").replaceAll("\\", "/").replace(/\/+$/u, "");
  const tree = clean === "**" || clean.endsWith("/**");
  const base = tree ? clean.replace(/\/?\*\*$/u, "") : clean;
  if (!clean || isAbsolute(clean) || clean.startsWith("/") ||
      (base && base.split("/").some((segment) => !segment || segment === "." || segment === "..")) ||
      /[?*\[]/u.test(base) || (!tree && /[?*\[]/u.test(clean))) {
    throw new Error(`writeScope must use an exact relative path or directory/**: ${value}`);
  }
  return tree ? (base ? `${base}/**` : "**") : base;
}

export function validateApplication(raw, expectedRunId) {
  const encoded = JSON.stringify(raw ?? {});
  if (Buffer.byteLength(encoded, "utf8") > 32 * 1024) throw new Error("application exceeds 32 KiB");
  if (SECRET.test(encoded)) throw new Error("application appears to contain a secret");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("application must be an object");
  const role = String(raw.role ?? "");
  if (!ROLES.has(role)) throw new Error(`invalid role: ${role || "missing"}`);
  const objective = typeof raw.objective === "string" ? raw.objective.trim() : "";
  if (!objective) throw new Error("application objective is required");
  const acceptance = strings(raw.acceptance);
  if (acceptance.length === 0) throw new Error("application acceptance must be a non-empty string array");
  const runId = String(raw.runId ?? expectedRunId ?? "").trim();
  if (!runId || (expectedRunId && runId !== expectedRunId)) throw new Error("application runId does not match the active run");
  const id = typeof raw.id === "string" && /^[a-zA-Z0-9._-]{1,96}$/u.test(raw.id) ? raw.id : randomUUID();
  const writeScope = strings(raw.writeScope).map(normalizeWriteScope);
  const reviewFor = typeof raw.reviewFor === "string" && raw.reviewFor.trim() ? raw.reviewFor.trim() : null;
  if ((role.endsWith("reviewer") || role === "researcher") && writeScope.length > 0) {
    throw new Error(`${role} applications must be read-only`);
  }
  if (["spec-reviewer", "quality-reviewer"].includes(role) && !reviewFor) {
    throw new Error(`${role} requires reviewFor`);
  }
  if (role === "final-reviewer" && reviewFor) throw new Error("final-reviewer reviewFor must be null");
  return {
    version: 1,
    id,
    runId,
    role,
    objective,
    nonGoals: strings(raw.nonGoals),
    references: strings(raw.references),
    acceptance,
    dependencies: strings(raw.dependencies),
    writeScope,
    reviewFor,
    requiredEvidence: strings(raw.requiredEvidence),
    nonce: randomBytes(16).toString("hex"),
    createdAt: new Date().toISOString(),
  };
}

export function applicationMarker(application) {
  return `SUBAGENT_APPLICATION ${application.id} ${application.nonce}`;
}

export function parseApplicationMarker(text) {
  const match = String(text ?? "").match(MARKER);
  return match ? { applicationId: match[1], nonce: match[2] } : null;
}

function headingSections(value, headings) {
  const lines = value.split(/\r?\n/u);
  const sections = new Map();
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/u)?.[1];
    if (heading && headings.includes(heading)) {
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return new Map([...sections].map(([heading, content]) => [heading, content.join("\n").trim()]));
}

export function validateResultCard(text, application = null) {
  const value = String(text ?? "");
  const headings = ["Answer", "Evidence", "Files/commands inspected", "Verification", "Assumptions", "Gaps", "Parent action needed"];
  const missing = headings.filter((heading) => !new RegExp(`^#{1,6}\\s+${heading.replace("/", "\\/")}\\s*$`, "imu").test(value));
  const status = value.match(/^Status:\s*(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\s*$/imu)?.[1] ?? null;
  if (!status) missing.unshift("Status");
  const sections = headingSections(value, headings);
  for (const heading of headings) {
    if (!missing.includes(heading) && !sections.get(heading)) missing.push(`${heading} content`);
  }
  if (["DONE", "DONE_WITH_CONCERNS"].includes(status)) {
    const evidence = sections.get("Evidence") ?? "";
    const verification = sections.get("Verification") ?? "";
    const concreteAnchor = /(?:^|\s)(?:[.\w-]+\/)+[.\w-]+(?::\d+)?(?:\s|$)|\b[a-f0-9]{40,64}\b/iu;
    const verificationOutcome = /\b(?:pass(?:ed|es|ing)?|fail(?:ed|s|ing)?|exit(?:ed)?\s+(?:code\s+)?\d+|unverified|not\s+run)\b/iu;
    if (evidence && !concreteAnchor.test(evidence)) missing.push("Evidence anchor");
    if (verification && !verificationOutcome.test(verification)) missing.push("Verification outcome");
    if (application?.requiredEvidence?.length > 0) {
      const combined = `${evidence}\n${verification}`.toLowerCase();
      const unmet = application.requiredEvidence.filter((item) => {
        const words = String(item).toLowerCase().match(/[a-z0-9_-]{4,}/gu) ?? [];
        return words.length > 0 && !words.some((word) => combined.includes(word));
      });
      if (unmet.length > 0) missing.push(`Required evidence: ${unmet.join(" | ")}`);
    }
  }
  return { valid: missing.length === 0, missing, status };
}

function canonicalPath(path) {
  let cursor = resolve(path);
  const tail = [];
  for (;;) {
    try {
      return resolve(realpathSync(cursor), ...tail);
    } catch (error) {
      if (error?.code !== "ENOENT") return null;
      const parent = dirname(cursor);
      if (parent === cursor) return null;
      tail.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("../") && !isAbsolute(rel));
}

export function targetWithinScope(target, cwd, scopes) {
  if (scopes.length === 0) return false;
  const root = resolve(cwd);
  const absolute = resolve(target);
  if (!inside(root, absolute) || absolute === root) return false;
  const canonicalRoot = canonicalPath(root);
  const canonicalTarget = canonicalPath(absolute);
  if (!canonicalRoot || !canonicalTarget || !inside(canonicalRoot, canonicalTarget) || canonicalTarget === canonicalRoot) return false;
  return scopes.some((scope) => {
    let clean;
    try {
      clean = normalizeWriteScope(scope);
    } catch {
      return false;
    }
    const tree = clean === "**" || clean.endsWith("/**");
    const base = clean === "**" ? "" : clean.replace(/\/?\*\*$/u, "");
    const canonicalBase = canonicalPath(resolve(root, base));
    if (!canonicalBase || !inside(canonicalRoot, canonicalBase)) return false;
    if (!tree) return canonicalTarget === canonicalBase;
    const rel = relative(canonicalBase, canonicalTarget);
    return rel === "" || (!rel.startsWith("../") && !isAbsolute(rel));
  });
}

export function writeScopesOverlap(left, right) {
  const describe = (value) => {
    const clean = normalizeWriteScope(value);
    return { tree: clean === "**" || clean.endsWith("/**"), base: clean === "**" ? "" : clean.replace(/\/?\*\*$/u, "") };
  };
  return left.some((a) => right.some((b) => {
    const first = describe(a);
    const second = describe(b);
    if (!first.tree && !second.tree) return first.base === second.base;
    if (first.tree && second.tree) {
      return !first.base || !second.base || first.base === second.base ||
        first.base.startsWith(`${second.base}/`) || second.base.startsWith(`${first.base}/`);
    }
    const tree = first.tree ? first : second;
    const exact = first.tree ? second : first;
    return !tree.base || exact.base === tree.base || exact.base.startsWith(`${tree.base}/`);
  }));
}

export function formatApplicationContext(application, artifactPath) {
  return [
    "[Subagent Workflow Application]",
    `Application: ${application.id}`,
    `Role: ${application.role}`,
    `Objective: ${application.objective}`,
    `Artifact: ${artifactPath}`,
    `Acceptance: ${application.acceptance.join(" | ")}`,
    `Required evidence: ${application.requiredEvidence.length > 0 ? application.requiredEvidence.join(" | ") : "concrete path/line anchors and verification outcome"}`,
    `Write scope: ${application.writeScope.length > 0 ? application.writeScope.join(", ") : "read-only"}`,
    "Return a Result Card with `Status: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED` and headings: Answer, Evidence, Files/commands inspected, Verification, Assumptions, Gaps, Parent action needed.",
    "Do not dispatch another subagent. Do not copy secrets or paste entire source files.",
  ].join("\n");
}
