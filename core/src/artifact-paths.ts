import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

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

export function sessionEngagedArtifact(options: { cwd: string; carrier: string }): boolean {
  const cwd = resolve(options.cwd);
  const { carrier } = options;
  if (cwdInsideArtifact(cwd, carrier)) return true;
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