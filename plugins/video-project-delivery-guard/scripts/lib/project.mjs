import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const TEXT_BASENAMES = new Set([".gitignore", "LICENSE"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".cache", ".tmp"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function isTextPath(filePath) {
  return TEXT_BASENAMES.has(basename(filePath)) || TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export function resolveWorkspaceRoot(cwd) {
  const absolute = resolve(cwd);
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absolute,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return resolve(root);
  } catch {}

  const parts = absolute.split(sep);
  for (let index = parts.length - 3; index >= 0; index -= 1) {
    if (parts[index] === "artifacts" && parts[index + 1] === "video") {
      const prefix = parts.slice(0, index).join(sep);
      return resolve(prefix || sep);
    }
  }
  return absolute;
}

export function isVideoProjectRoot(projectRoot, workspaceRoot) {
  const expectedParent = join(resolve(workspaceRoot), "artifacts", "video");
  return dirname(resolve(projectRoot)) === expectedParent && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot));
}

export async function findVideoProjects(cwd, { maxProjects = 32 } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrierRoot = join(workspaceRoot, "artifacts", "video");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }

  const roots = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:artifacts/video/${entry.name}`);
    if (!entry.isDirectory()) continue;
    roots.push(join(carrierRoot, entry.name));
    if (roots.length > maxProjects) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
  }
  return { workspaceRoot, roots: roots.sort() };
}

export async function hashFile(filePath, { maxBytes = 8 * 1024 * 1024 * 1024, collectBytes = false } = {}) {
  const before = await lstat(filePath, { bigint: true });
  if (!before.isFile()) throw new Error(`NOT_A_FILE:${filePath}`);
  if (before.size > BigInt(maxBytes)) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${basename(filePath)}`);
  const hash = createHash("sha256");
  let bytes = 0;
  const chunks = collectBytes ? [] : null;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.byteLength;
    hash.update(chunk);
    if (chunks) chunks.push(chunk);
  }
  const after = await lstat(filePath, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw new Error(`FILE_CHANGED_DURING_READ:${basename(filePath)}`);
  return { digest: hash.digest("hex"), bytes, content: chunks ? Buffer.concat(chunks) : null };
}

async function collect(root, directory, state, limits) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${relativePath}`);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) await collect(root, absolute, state, limits);
      continue;
    }
    if (!entry.isFile()) continue;
    state.count += 1;
    if (state.count > limits.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
    const text = isTextPath(relativePath);
    const { digest, bytes, content } = await hashFile(absolute, { maxBytes: text ? Math.min(limits.maxBytesPerFile, limits.maxTextBytes) : limits.maxBytesPerFile, collectBytes: text });
    state.digests[relativePath] = digest;
    state.sizes[relativePath] = bytes;
    try { state.files[relativePath] = text ? UTF8.decode(content) : null; }
    catch { throw new Error(`PROJECT_TEXT_ENCODING_INVALID:${relativePath}`); }
  }
}

export async function loadVideoProject(projectRoot, limits = {}) {
  const root = resolve(projectRoot);
  const state = { files: {}, digests: {}, sizes: {}, count: 0 };
  await collect(root, root, state, {
    maxFiles: limits.maxFiles ?? 4096,
    maxBytesPerFile: limits.maxBytesPerFile ?? 8 * 1024 * 1024 * 1024,
    maxTextBytes: limits.maxTextBytes ?? 4 * 1024 * 1024,
  });
  const parse = (filePath) => {
    try { return JSON.parse(state.files[filePath] ?? ""); } catch { return null; }
  };
  return {
    artifactId: basename(root),
    root,
    files: state.files,
    digests: state.digests,
    sizes: state.sizes,
    plan: parse("plan.contract.json"),
    project: parse("video.project.json"),
  };
}
