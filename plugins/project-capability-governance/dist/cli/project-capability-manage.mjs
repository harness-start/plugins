#!/usr/bin/env node
// harness-source-hash: sha256:58e3e88a88f2c918afd8d01406e0b7b235012b9e74f3a59df63d84c421069e35
import {
  forgetNotice,
  isRecord,
  parseProposal,
  validateProposalDocument
} from "../chunks/chunk-TS5S5LIR.mjs";

// plugins/project-capability-governance/src/entries/cli/project-capability-manage.ts
import { resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/project-capability-governance/src/lib/lifecycle.ts
import { lstat, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
var PROPOSAL_ID = /^[a-z0-9][a-z0-9-]{2,63}$/u;
var ACTIVE_STATUSES = ["pending", "reviewing", "deferred"];
function errorCode(error) {
  return isRecord(error) && typeof error.code === "string" ? error.code : void 0;
}
async function realDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`expected a real directory: ${path}`);
  }
}
async function findProposal(projectRoot, proposalId) {
  if (!PROPOSAL_ID.test(proposalId ?? "")) throw new Error("invalid proposal id");
  const root = resolve(projectRoot);
  const capabilityRoot = join(root, ".project-capabilities");
  await realDirectory(capabilityRoot);
  const matches = [];
  for (const status of ACTIVE_STATUSES) {
    const directory = join(capabilityRoot, "inbox", status);
    try {
      await realDirectory(directory);
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
    const expectedName = `${proposalId}.md`;
    if (!(await readdir(directory)).includes(expectedName)) continue;
    const path = join(directory, expectedName);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("proposal must be a real Markdown file");
    const content = await readFile(path, "utf8");
    const parsed = parseProposal(content, basename(path));
    if (!parsed || parsed.id !== proposalId) throw new Error("proposal content does not match its filename");
    matches.push({ path, status, content, proposal: parsed });
  }
  if (matches.length === 0) throw new Error(`proposal not found: ${proposalId}`);
  if (matches.length > 1) throw new Error(`proposal id is ambiguous: ${proposalId}`);
  const found = matches[0];
  if (!found) throw new Error(`proposal not found: ${proposalId}`);
  return found;
}
async function deleteProposal(projectRoot, proposalId, outcome) {
  if (!["accepted", "duplicate", "rejected"].includes(outcome)) {
    throw new Error("outcome must be accepted, duplicate, or rejected");
  }
  const found = await findProposal(projectRoot, proposalId);
  if (found.status === "deferred") throw new Error("a deferred proposal must be reopened before deletion");
  await forgetNotice(projectRoot, proposalId);
  await unlink(found.path);
  return { deleted: proposalId, outcome };
}
function safeNote(value, field) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 500 || /[\r\n\0]/u.test(text)) throw new Error(`${field} must be a single line of 1-500 characters`);
  return text;
}
function updateFrontmatter(content, changes) {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/u);
  if (!match) throw new Error("proposal frontmatter is missing");
  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  if (prefix === void 0 || body === void 0 || suffix === void 0) {
    throw new Error("proposal frontmatter is missing");
  }
  const pending = new Map(Object.entries(changes));
  const lines = body.split(/\r?\n/u).flatMap((line) => {
    const field = line.match(/^([a-z][a-z0-9_]*):/u)?.[1];
    if (!field || !pending.has(field)) return [line];
    const value = pending.get(field);
    pending.delete(field);
    if (value === null) return [];
    return [`${field}: ${field === "status" ? value : JSON.stringify(value)}`];
  });
  for (const [field, value] of pending) {
    if (value !== null) lines.push(`${field}: ${field === "status" ? value : JSON.stringify(value)}`);
  }
  return `${prefix}${lines.join("\n")}${suffix}${content.slice(match[0].length)}`;
}
async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}
async function moveProposal(projectRoot, found, targetStatus, changes) {
  const targetDirectory = join(resolve(projectRoot), ".project-capabilities", "inbox", targetStatus);
  await realDirectory(targetDirectory);
  const target = join(targetDirectory, basename(found.path));
  try {
    await lstat(target);
    throw new Error(`target proposal already exists: ${targetStatus}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const nextContent = updateFrontmatter(found.content, { status: targetStatus, ...changes });
  await rename(found.path, target);
  try {
    await atomicWrite(target, nextContent);
  } catch (error) {
    await rename(target, found.path).catch(() => {
    });
    throw error;
  }
  return { proposal: found.proposal.id, status: targetStatus };
}
async function startProposal(projectRoot, proposalId) {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "pending") throw new Error("only a pending proposal can start review");
  return moveProposal(projectRoot, found, "reviewing", { blocker: null });
}
async function blockProposal(projectRoot, proposalId, reason) {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "reviewing") throw new Error("only a reviewing proposal can be blocked");
  await atomicWrite(found.path, updateFrontmatter(found.content, { blocker: safeNote(reason, "reason") }));
  return { proposal: proposalId, status: "reviewing", blocked: true };
}
async function deferProposal(projectRoot, proposalId, condition) {
  const found = await findProposal(projectRoot, proposalId);
  if (!["pending", "reviewing"].includes(found.status)) throw new Error("only a pending or reviewing proposal can be deferred");
  return moveProposal(projectRoot, found, "deferred", {
    blocker: null,
    revisit_condition: safeNote(condition, "condition")
  });
}
async function reopenProposal(projectRoot, proposalId) {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "deferred") throw new Error("only a deferred proposal can be reopened");
  return moveProposal(projectRoot, found, "pending", {
    blocker: null,
    revisit_condition: null
  });
}

// plugins/project-capability-governance/src/entries/cli/project-capability-manage.ts
function parseArgs(argv) {
  const [action, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--") || index + 1 >= rest.length) throw new Error(`invalid argument: ${key}`);
    const value = rest[index + 1];
    if (value === void 0) throw new Error(`invalid argument: ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return { action, options };
}
async function main(argv = process.argv.slice(2)) {
  const { action, options } = parseArgs(argv);
  const root = resolve2(options.root ?? process.cwd());
  let result;
  if (action === "start") result = await startProposal(root, options.proposal ?? "");
  else if (action === "block") result = await blockProposal(root, options.proposal ?? "", options.reason);
  else if (action === "defer") result = await deferProposal(root, options.proposal ?? "", options.condition);
  else if (action === "reopen") result = await reopenProposal(root, options.proposal ?? "");
  else if (action === "delete") result = await deleteProposal(root, options.proposal ?? "", options.outcome ?? "");
  else throw new Error("action must be start, block, defer, reopen, or delete");
  process.stdout.write(`${JSON.stringify(result)}
`);
}
var isMain = process.argv[1] && resolve2(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[project-capability-manage] ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
export {
  main,
  parseArgs,
  validateProposalDocument
};
