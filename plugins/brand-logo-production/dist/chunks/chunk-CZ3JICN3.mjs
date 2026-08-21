// harness-source-hash: sha256:c633e514c8b6e22889b72b5d0d4eb8e6d1c8e9b4d53f21168e1cfdc3f8bbf728

// plugins/brand-logo-production/src/lib/project.ts
import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
var MAX_FILES = 2048;
var MAX_FILE_BYTES = 64 * 1024 * 1024;
function resolveWorkspaceRoot(cwd) {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "logo" && basename(dirname(dirname(current))) === "artifacts") return dirname(dirname(dirname(current)));
    current = dirname(current);
  }
  return resolve(cwd);
}
async function findLogoProjects(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const artifactRoot = join(workspaceRoot, "artifacts", "logo");
  try {
    const expectedRoot = join(await realpath(workspaceRoot), "artifacts", "logo");
    if (await realpath(artifactRoot) !== expectedRoot) throw new Error("SYMLINK_REJECTED:artifacts/logo");
    const roots = (await readdir(artifactRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)).map((entry) => join(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
}
async function assertLogoProjectRoot(root) {
  const candidate = resolve(root);
  const { roots } = await findLogoProjects(candidate);
  if (!roots.includes(candidate)) throw new Error("PROJECT_ROOT_UNREGISTERED: expected a discovered non-symlink artifacts/logo/<logo-id> directory");
  return candidate;
}
async function collect(root, directory, model, count) {
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
async function loadLogoProject(root) {
  const model = { artifactId: basename(root), files: {}, bytes: {}, digests: {}, plan: null, project: null };
  await collect(root, root, model, { value: 0 });
  const parse = (path) => {
    try {
      return JSON.parse(String(model.files[path] ?? ""));
    } catch {
      return null;
    }
  };
  model.plan = parse("plan.contract.json");
  model.project = parse("logo.project.json");
  return model;
}

export {
  resolveWorkspaceRoot,
  findLogoProjects,
  assertLogoProjectRoot,
  loadLogoProject
};
