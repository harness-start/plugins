import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import type { BytesMap, DigestMap, FileMap, LogoModel } from "./contract.js";

const MAX_FILES = 2048;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

export type LoadedLogoProject = LogoModel & {
  artifactId: string;
  files: FileMap;
  bytes: BytesMap;
  digests: DigestMap;
};

export function resolveWorkspaceRoot(cwd: string): string {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "logo" && basename(dirname(dirname(current))) === "artifacts") return dirname(dirname(dirname(current)));
    current = dirname(current);
  }
  return resolve(cwd);
}

export async function findLogoProjects(cwd: string): Promise<{ workspaceRoot: string; roots: string[] }> {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const artifactRoot = join(workspaceRoot, "artifacts", "logo");
  try {
    const expectedRoot = join(await realpath(workspaceRoot), "artifacts", "logo");
    if (await realpath(artifactRoot) !== expectedRoot) throw new Error("SYMLINK_REJECTED:artifacts/logo");
    const roots = (await readdir(artifactRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name))
      .map((entry) => join(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
}

export async function assertLogoProjectRoot(root: string): Promise<string> {
  const candidate = resolve(root);
  const { roots } = await findLogoProjects(candidate);
  if (!roots.includes(candidate)) throw new Error("PROJECT_ROOT_UNREGISTERED: expected a discovered non-symlink artifacts/logo/<logo-id> directory");
  return candidate;
}

async function collect(
  root: string,
  directory: string,
  model: { files: FileMap; bytes: BytesMap; digests: DigestMap },
  count: { value: number },
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${relative(root, join(directory, entry.name))}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, model, count);
    else if (entry.isFile()) {
      count.value += 1;
      if (count.value > MAX_FILES) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${relative(root, absolute)}`);
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      model.files[filePath] = bytes.toString("utf8");
      model.bytes[filePath] = bytes;
      model.digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

export async function loadLogoProject(root: string): Promise<LoadedLogoProject> {
  const model: LoadedLogoProject = { artifactId: basename(root), files: {}, bytes: {}, digests: {}, plan: null, project: null };
  await collect(root, root, model, { value: 0 });
  const parse = (path: string): unknown => {
    try { return JSON.parse(String(model.files[path] ?? "")); } catch { return null; }
  };
  model.plan = parse("plan.contract.json");
  model.project = parse("logo.project.json");
  return model;
}
