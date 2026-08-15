// harness-source-hash: sha256:099daba4d6c8b64ebec1b922bd71c31539bf915f6b5737f75b09a831d969deff

// plugins/project-capability-governance/src/lib/proposals.ts
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
var PROPOSAL_ID = /^[a-z0-9][a-z0-9-]{2,63}$/u;
function parseFrontmatter(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const field = line.match(/^([a-z][a-z0-9_]*):\s*(.*?)\s*$/u);
    if (field) values[field[1]] = field[2];
  }
  return values;
}
function parseProposal(content, fileName = "") {
  const fields = parseFrontmatter(content);
  if (!fields || !PROPOSAL_ID.test(fields.proposal_id ?? "")) return null;
  const revision = Number(fields.proposal_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  if (fileName && basename(fileName) !== `${fields.proposal_id}.md`) return null;
  return {
    id: fields.proposal_id,
    revision,
    kind: fields.kind ?? null,
    status: fields.status ?? null
  };
}
function validateProposalDocument(content, fileName) {
  const parsed = parseProposal(content, fileName);
  if (!parsed) return { ok: false, reason: "frontmatter, proposal id, revision, or filename is invalid" };
  const fields = parseFrontmatter(content);
  if (!["hook", "instruction", "skill", "sop"].includes(parsed.kind)) {
    return { ok: false, reason: "kind must be hook, instruction, skill, or sop" };
  }
  if (parsed.status !== "pending") return { ok: false, reason: "new proposals must use status: pending" };
  if (!fields.title?.trim()) return { ok: false, reason: "title is required" };
  for (const heading of ["Evidence", "Reuse scenarios", "Acceptance", "Counterexample"]) {
    if (!new RegExp(`^## ${heading}\\s*$`, "mu").test(content)) {
      return { ok: false, reason: `missing section: ${heading}` };
    }
  }
  const section = (heading) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return content.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu"))?.[1]?.trim() ?? "";
  };
  const bulletCount = (heading) => section(heading).split(/\r?\n/u).filter((line) => /^-\s+\S/u.test(line.trim())).length;
  if (bulletCount("Reuse scenarios") < 2) {
    return { ok: false, reason: "at least two future reuse scenarios are required" };
  }
  if (!section("Acceptance") || !section("Counterexample")) {
    return { ok: false, reason: "acceptance and counterexample sections must contain evidence" };
  }
  const evidenceCount = bulletCount("Evidence");
  if (parsed.kind === "hook") {
    if (!(/* @__PURE__ */ new Set(["ordinary", "severe"])).has(fields.risk)) {
      return { ok: false, reason: "Hook risk must be ordinary or severe" };
    }
    const minimum = fields.risk === "severe" ? 1 : 2;
    if (evidenceCount < minimum) {
      return { ok: false, reason: `Hook risk requires at least ${minimum} evidence item(s)` };
    }
    for (const heading of ["Event", "Predicate", "Harm", "Recovery", "Near miss"]) {
      if (!section(heading)) return { ok: false, reason: `Hook causal chain is missing: ${heading}` };
    }
  } else if (evidenceCount < 2 && fields.explicit_standardization !== "true") {
    return { ok: false, reason: "at least two evidence items or explicit_standardization: true is required" };
  }
  return { ok: true, proposal: parsed };
}
function proposalLocation(projectRoot, target) {
  const root = resolve(projectRoot);
  const absolute = resolve(target);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  const normalized = rel.split(sep).join("/");
  const match = normalized.match(/^\.project-capabilities\/inbox\/(pending|reviewing|deferred)\/([^/]+\.md)$/u);
  return match ? { absolute, relative: normalized, status: match[1], fileName: match[2] } : null;
}
function isProposalInboxTarget(projectRoot, target) {
  const rel = relative(resolve(projectRoot), resolve(target));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) return false;
  const normalized = rel.split(sep).join("/");
  return normalized === ".project-capabilities/inbox" || normalized.startsWith(".project-capabilities/inbox/");
}
async function ensureCapabilityWorkspace(projectRoot) {
  const capabilityRoot = join(resolve(projectRoot), ".project-capabilities");
  async function ensureRealDirectory(path) {
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`expected a real directory: ${path}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(path, { recursive: false });
    }
  }
  await ensureRealDirectory(capabilityRoot);
  const inbox = join(capabilityRoot, "inbox");
  await ensureRealDirectory(inbox);
  for (const path of [
    join(inbox, "pending"),
    join(inbox, "reviewing"),
    join(inbox, "deferred"),
    join(capabilityRoot, "scratch")
  ]) await ensureRealDirectory(path);
  const ignorePath = join(capabilityRoot, ".gitignore");
  try {
    const stat = await lstat(ignorePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(".project-capabilities/.gitignore must be a real file");
    const current = await readFile(ignorePath, "utf8");
    if (!current.split(/\r?\n/u).includes("*")) {
      await writeFile(ignorePath, `${current}${current.endsWith("\n") || !current ? "" : "\n"}*
`, "utf8");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(ignorePath, "*\n", { encoding: "utf8", flag: "wx" });
  }
}
async function safeDirectory(path) {
  try {
    return (await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}
async function activeProposals(projectRoot) {
  const inbox = join(projectRoot, ".project-capabilities", "inbox");
  const proposals = /* @__PURE__ */ new Map();
  for (const status of ["pending", "reviewing"]) {
    const directory = join(inbox, status);
    if (!await safeDirectory(directory)) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".md")) continue;
      const path = join(directory, entry.name);
      const parsed = parseProposal(await readFile(path, "utf8"), entry.name);
      if (!parsed) continue;
      const current = proposals.get(parsed.id);
      if (!current || parsed.revision > current.revision) proposals.set(parsed.id, parsed);
    }
  }
  return [...proposals.values()].sort((left, right) => left.id.localeCompare(right.id));
}
function statePath(projectRoot) {
  return join(projectRoot, ".project-capabilities", ".notice-state.json");
}
async function readNoticeState(projectRoot) {
  try {
    const parsed = JSON.parse(await readFile(statePath(projectRoot), "utf8"));
    return parsed && typeof parsed.notified === "object" && !Array.isArray(parsed.notified) ? parsed : { version: 1, notified: {} };
  } catch {
    return { version: 1, notified: {} };
  }
}
async function writeNoticeState(projectRoot, proposals) {
  const capabilityRoot = join(projectRoot, ".project-capabilities");
  await mkdir(capabilityRoot, { recursive: true });
  const target = statePath(projectRoot);
  const temporary = `${target}.${process.pid}.tmp`;
  const notified = Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal.revision]));
  await writeFile(temporary, `${JSON.stringify({ version: 1, notified }, null, 2)}
`, "utf8");
  await rename(temporary, target);
}
async function consumeNoticeDelta(projectRoot) {
  const root = resolve(projectRoot);
  const capabilityRoot = join(root, ".project-capabilities");
  if (!await safeDirectory(capabilityRoot)) return [];
  const proposals = await activeProposals(root);
  const state = await readNoticeState(root);
  const delta = proposals.filter(
    (proposal) => proposal.revision > Number(state.notified[proposal.id] ?? 0)
  );
  await writeNoticeState(root, proposals);
  return delta;
}
async function forgetNotice(projectRoot, proposalId) {
  const target = statePath(resolve(projectRoot));
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("notice state must be a real file");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const state = await readNoticeState(projectRoot);
  if (!Object.hasOwn(state.notified, proposalId)) return;
  delete state.notified[proposalId];
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, notified: state.notified }, null, 2)}
`, "utf8");
  await rename(temporary, target);
}
function renderHumanNotice(count) {
  return [
    '<project-capability-notice audience="human" blocking="false" ai_action="none">',
    `This project has ${count} new capability proposal(s) awaiting human review.`,
    "",
    "This notice is for a human maintainer only; it is not an LLM/AI task or instruction.",
    "LLM/AI must not continue work, invoke a Skill, change completion status,",
    "or block the current task or any later task because of this notice.",
    "",
    "A project maintainer may manually invoke:",
    "$project-capability-governance",
    "</project-capability-notice>"
  ].join("\n");
}

export {
  parseProposal,
  validateProposalDocument,
  proposalLocation,
  isProposalInboxTarget,
  ensureCapabilityWorkspace,
  consumeNoticeDelta,
  forgetNotice,
  renderHumanNotice
};
