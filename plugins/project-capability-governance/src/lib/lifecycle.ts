import { lstat, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import { forgetNotice, parseProposal, type Proposal } from "./proposals.js";

const PROPOSAL_ID = /^[a-z0-9][a-z0-9-]{2,63}$/u;
const ACTIVE_STATUSES = ["pending", "reviewing", "deferred"] as const;

export type ActiveProposalStatus = (typeof ACTIVE_STATUSES)[number];

export type FoundProposal = {
  path: string;
  status: ActiveProposalStatus;
  content: string;
  proposal: Proposal;
};

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

async function realDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`expected a real directory: ${path}`);
  }
}

export async function findProposal(projectRoot: string, proposalId: string): Promise<FoundProposal> {
  if (!PROPOSAL_ID.test(proposalId ?? "")) throw new Error("invalid proposal id");
  const root = resolve(projectRoot);
  const capabilityRoot = join(root, ".project-capabilities");
  await realDirectory(capabilityRoot);
  const matches: FoundProposal[] = [];
  for (const status of ACTIVE_STATUSES) {
    const directory = join(capabilityRoot, "inbox", status);
    try {
      await realDirectory(directory);
    } catch (error: unknown) {
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

export async function deleteProposal(
  projectRoot: string,
  proposalId: string,
  outcome: string,
): Promise<{ deleted: string; outcome: string }> {
  if (!["accepted", "duplicate", "rejected"].includes(outcome)) {
    throw new Error("outcome must be accepted, duplicate, or rejected");
  }
  const found = await findProposal(projectRoot, proposalId);
  if (found.status === "deferred") throw new Error("a deferred proposal must be reopened before deletion");
  await forgetNotice(projectRoot, proposalId);
  await unlink(found.path);
  return { deleted: proposalId, outcome };
}

function safeNote(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > 500 || /[\r\n\0]/u.test(text)) throw new Error(`${field} must be a single line of 1-500 characters`);
  return text;
}

function updateFrontmatter(content: string, changes: Record<string, string | null>): string {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/u);
  if (!match) throw new Error("proposal frontmatter is missing");
  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  if (prefix === undefined || body === undefined || suffix === undefined) {
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

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function moveProposal(
  projectRoot: string,
  found: FoundProposal,
  targetStatus: ActiveProposalStatus,
  changes: Record<string, string | null>,
): Promise<{ proposal: string; status: ActiveProposalStatus }> {
  const targetDirectory = join(resolve(projectRoot), ".project-capabilities", "inbox", targetStatus);
  await realDirectory(targetDirectory);
  const target = join(targetDirectory, basename(found.path));
  try {
    await lstat(target);
    throw new Error(`target proposal already exists: ${targetStatus}`);
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const nextContent = updateFrontmatter(found.content, { status: targetStatus, ...changes });
  await rename(found.path, target);
  try {
    await atomicWrite(target, nextContent);
  } catch (error: unknown) {
    await rename(target, found.path).catch(() => {});
    throw error;
  }
  return { proposal: found.proposal.id, status: targetStatus };
}

export async function startProposal(
  projectRoot: string,
  proposalId: string,
): Promise<{ proposal: string; status: ActiveProposalStatus }> {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "pending") throw new Error("only a pending proposal can start review");
  return moveProposal(projectRoot, found, "reviewing", { blocker: null });
}

export async function blockProposal(
  projectRoot: string,
  proposalId: string,
  reason: unknown,
): Promise<{ proposal: string; status: "reviewing"; blocked: true }> {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "reviewing") throw new Error("only a reviewing proposal can be blocked");
  await atomicWrite(found.path, updateFrontmatter(found.content, { blocker: safeNote(reason, "reason") }));
  return { proposal: proposalId, status: "reviewing", blocked: true };
}

export async function deferProposal(
  projectRoot: string,
  proposalId: string,
  condition: unknown,
): Promise<{ proposal: string; status: ActiveProposalStatus }> {
  const found = await findProposal(projectRoot, proposalId);
  if (!["pending", "reviewing"].includes(found.status)) throw new Error("only a pending or reviewing proposal can be deferred");
  return moveProposal(projectRoot, found, "deferred", {
    blocker: null,
    revisit_condition: safeNote(condition, "condition"),
  });
}

export async function reopenProposal(
  projectRoot: string,
  proposalId: string,
): Promise<{ proposal: string; status: ActiveProposalStatus }> {
  const found = await findProposal(projectRoot, proposalId);
  if (found.status !== "deferred") throw new Error("only a deferred proposal can be reopened");
  return moveProposal(projectRoot, found, "pending", {
    blocker: null,
    revisit_condition: null,
  });
}
