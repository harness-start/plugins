import { basename, dirname, resolve } from "node:path";

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