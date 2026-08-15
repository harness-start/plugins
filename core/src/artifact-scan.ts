import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { isKebabArtifactId, resolveWorkspaceRoot } from "./artifact-paths.ts";

const SKIP_NAMES = new Set(["node_modules", ".git", ".cache", ".tmp"]);

export type CollectProjectFilesOptions = {
  maxFiles?: number;
  maxFileBytes?: number;
};

export type CollectedProjectFiles = {
  files: Record<string, string>;
  digests: Record<string, string>;
  bytes: Record<string, Buffer>;
};

export async function collectProjectFiles(
  root: string,
  options: CollectProjectFilesOptions = {},
): Promise<CollectedProjectFiles> {
  const files: Record<string, string> = {};
  const digests: Record<string, string> = {};
  const bytes: Record<string, Buffer> = {};
  await collect(resolve(root), resolve(root), files, digests, bytes, { value: 0 }, options);
  return { files, digests, bytes };
}

async function collect(
  root: string,
  directory: string,
  files: Record<string, string>,
  digests: Record<string, string>,
  bytesMap: Record<string, Buffer>,
  count: { value: number },
  options: CollectProjectFilesOptions,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (SKIP_NAMES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(root, absolute, files, digests, bytesMap, count, options);
    } else if (entry.isFile()) {
      count.value += 1;
      if (options.maxFiles && count.value > options.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (options.maxFileBytes && bytes.byteLength > options.maxFileBytes) {
        throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      }
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

export async function findCarrierProjects(
  cwd: string,
  carrier: string,
  options: { requireKebab?: boolean } = {},
): Promise<{ workspaceRoot: string; roots: string[] }> {
  const workspaceRoot = resolveWorkspaceRoot(cwd, carrier);
  const artifactRoot = join(workspaceRoot, "artifacts", carrier);
  try {
    const roots = (await readdir(artifactRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && (options.requireKebab === false || isKebabArtifactId(entry.name)))
      .slice(0, 32)
      .map((entry) => join(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
}