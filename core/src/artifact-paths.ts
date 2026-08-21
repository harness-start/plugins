import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { atomicWriteJson, digestKey } from "./state-file.js";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isKebabArtifactId(name: string): boolean {
  return KEBAB.test(name);
}

export function resolveWorkspaceRoot(cwd: string, carrier: string): string {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === carrier && basename(dirname(dirname(current))) === "artifacts") {
      return dirname(dirname(dirname(current)));
    }
    current = dirname(current);
  }
  return resolve(cwd);
}

export function touchesArtifact(options: {
  cwd: string;
  carrier: string;
  command?: string;
  paths?: readonly string[];
}): boolean {
  const { cwd, carrier, command = "", paths = [] } = options;
  const marker = `artifacts/${carrier}`;
  const cwdNorm = resolve(cwd).replaceAll("\\", "/");
  const workspace = resolveWorkspaceRoot(cwd, carrier).replaceAll("\\", "/");
  if (cwdNorm === `${workspace}/${marker}` || cwdNorm.startsWith(`${workspace}/${marker}/`)) return true;
  return [command, ...paths].join("\n").replaceAll("\\", "/").includes(marker);
}

export function artifactJournalName(carrier: string): string {
  return `.${carrier}-delivery-journal.json`;
}

export function cwdInsideArtifact(cwd: string, carrier: string): boolean {
  const cwdNorm = resolve(cwd).replaceAll("\\", "/");
  const workspace = resolveWorkspaceRoot(cwd, carrier).replaceAll("\\", "/");
  const marker = `artifacts/${carrier}`;
  return cwdNorm === `${workspace}/${marker}` || cwdNorm.startsWith(`${workspace}/${marker}/`);
}

type ArtifactSessionOptions = {
  cwd: string;
  carrier: string;
  sessionId?: string;
  dataRoot?: string;
};

const ARTIFACT_SESSION_SCHEMA = "artifact-session-engagement/v1";

function artifactSessionMarker(options: ArtifactSessionOptions): { path: string; workspaceDigest: string; sessionDigest: string } | null {
  const sessionId = String(options.sessionId ?? "").trim();
  if (!sessionId || sessionId === "hook" || sessionId === "unknown") return null;
  const dataRoot = options.dataRoot ?? (process.env.HARNESS_HOST === "codex"
    ? process.env.PLUGIN_DATA
    : process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA);
  if (!dataRoot) return null;
  const workspaceDigest = digestKey(resolveWorkspaceRoot(options.cwd, options.carrier));
  const sessionDigest = digestKey(sessionId);
  const key = digestKey(`${workspaceDigest}\0${options.carrier}\0${sessionDigest}`);
  return { path: join(dataRoot, "artifact-session-engagement", `${key}.json`), workspaceDigest, sessionDigest };
}

export function markSessionEngagedArtifact(options: ArtifactSessionOptions): boolean {
  const marker = artifactSessionMarker(options);
  if (!marker) return false;
  return atomicWriteJson(marker.path, {
    schema: ARTIFACT_SESSION_SCHEMA,
    workspaceDigest: marker.workspaceDigest,
    carrier: options.carrier,
    sessionDigest: marker.sessionDigest,
  });
}

function hasSessionEngagement(options: ArtifactSessionOptions): boolean {
  const marker = artifactSessionMarker(options);
  if (!marker) return false;
  try {
    const value: unknown = JSON.parse(readFileSync(marker.path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return record.schema === ARTIFACT_SESSION_SCHEMA
      && record.workspaceDigest === marker.workspaceDigest
      && record.carrier === options.carrier
      && record.sessionDigest === marker.sessionDigest;
  } catch {
    return false;
  }
}

export function sessionEngagedArtifact(options: ArtifactSessionOptions): boolean {
  const cwd = resolve(options.cwd);
  const { carrier } = options;
  if (cwdInsideArtifact(cwd, carrier)) return true;
  if (hasSessionEngagement(options)) return true;
  const workspace = resolveWorkspaceRoot(cwd, carrier);
  const artifactRoot = join(workspace, "artifacts", carrier);
  const journal = artifactJournalName(carrier);
  if (existsSync(artifactRoot)) {
    try {
      for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (existsSync(join(artifactRoot, entry.name, journal))) return true;
      }
    } catch {
      /* ignore unreadable artifact roots */
    }
  }
  return false;
}

export function projectInside(relativePath = "", cwd = "", carrier: string): string {
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
  const escaped = carrier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const fromPath = normalized.match(new RegExp(`(?:^|/)artifacts/${escaped}/[^/]+/(?<inside>.+)$`, "u"));
  if (fromPath?.groups?.inside) return fromPath.groups.inside;
  const cwdNorm = String(cwd ?? "").replaceAll("\\", "/");
  if (new RegExp(`(?:^|/)artifacts/${escaped}/[^/]+(?:/|$)`, "u").test(cwdNorm)) {
    return normalized.replace(/^\.\//u, "");
  }
  return "";
}
