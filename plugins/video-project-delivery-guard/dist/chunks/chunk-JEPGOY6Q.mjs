// harness-source-hash: sha256:1deb377332db5d9c89b57dce5ad89b6ccfcf0897b36cf63af3c00bbe3bcf6642

// plugins/video-project-delivery-guard/src/lib/project.ts
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
var TEXT_BASENAMES = /* @__PURE__ */ new Set([".gitignore", "LICENSE"]);
var SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set(["node_modules", ".git", ".cache", ".tmp"]);
var UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function isTextPath(filePath) {
  return TEXT_BASENAMES.has(basename(filePath)) || TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}
function resolveWorkspaceRoot(cwd) {
  const absolute = resolve(cwd);
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absolute,
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (root) return resolve(root);
  } catch {
  }
  const parts = absolute.split(sep);
  for (let index = parts.length - 3; index >= 0; index -= 1) {
    if (parts[index] === "artifacts" && parts[index + 1] === "video") {
      const prefix = parts.slice(0, index).join(sep);
      return resolve(prefix || sep);
    }
  }
  return absolute;
}
function isVideoProjectRoot(projectRoot, workspaceRoot) {
  const expectedParent = join(resolve(workspaceRoot), "artifacts", "video");
  return dirname(resolve(projectRoot)) === expectedParent && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot));
}
async function findVideoProjects(cwd, { maxProjects = 32 } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrierRoot = join(workspaceRoot, "artifacts", "video");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code === "ENOENT") return { workspaceRoot, roots: [] };
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
async function hashFile(filePath, { maxBytes = 8 * 1024 * 1024 * 1024, collectBytes = false } = {}) {
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
    try {
      state.files[relativePath] = text && content ? UTF8.decode(content) : null;
    } catch {
      throw new Error(`PROJECT_TEXT_ENCODING_INVALID:${relativePath}`);
    }
  }
}
async function loadVideoProject(projectRoot, limits = {}) {
  const root = resolve(projectRoot);
  const state = { files: {}, digests: {}, sizes: {}, count: 0 };
  await collect(root, root, state, {
    maxFiles: limits.maxFiles ?? 4096,
    maxBytesPerFile: limits.maxBytesPerFile ?? 8 * 1024 * 1024 * 1024,
    maxTextBytes: limits.maxTextBytes ?? 4 * 1024 * 1024
  });
  const parse = (filePath) => {
    try {
      return JSON.parse(state.files[filePath] ?? "");
    } catch {
      return null;
    }
  };
  const project = parse("video.project.json");
  return {
    artifactId: basename(root),
    root,
    files: state.files,
    digests: state.digests,
    sizes: state.sizes,
    plan: parse("plan.contract.json"),
    project: project !== null && typeof project === "object" && !Array.isArray(project) ? project : null
  };
}

// plugins/video-project-delivery-guard/src/lib/writer.ts
import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
function assertVideoProjectRoot(value) {
  const root = resolve2(value ?? "");
  const workspaceRoot = resolveWorkspaceRoot(root);
  if (!isVideoProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  return root;
}
function sessionMetadata(capability, grant = {}) {
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: grant.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: grant.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    capability
  };
}
async function atomicWriteJson(root, relativePath, payload) {
  const target = join2(root, relativePath);
  const temporaryDirectory = join2(root, ".tmp", "video-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join2(temporaryDirectory, `${basename2(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}
`, { flag: "wx" });
  await mkdir(dirname2(target), { recursive: true });
  await rename(temporary, target);
}
async function withWriterJournal(root, capability, callback, grant = {}) {
  const journalPath = join2(root, ".video-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "video-project-delivery-guard", operation: capability, artifactId: basename2(root), ...sessionMetadata(capability, grant) })}
`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const result = await callback();
  await unlink(journalPath).catch((error) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code !== "ENOENT") throw error;
  });
  return result;
}

export {
  resolveWorkspaceRoot,
  findVideoProjects,
  hashFile,
  loadVideoProject,
  assertVideoProjectRoot,
  sessionMetadata,
  atomicWriteJson,
  withWriterJournal
};
