import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const CHILD_SOURCE = `import { pathToFileURL } from "node:url";
const loaded = await import(pathToFileURL(process.argv[1]).href);
process.stdout.write(JSON.stringify(loaded.default));`;

function loadOnce(root) {
  return new Promise((resolvePromise, reject) => {
    const compositionPath = join(root, "src", "composition.mjs");
    const child = spawn(process.execPath, [
      "--no-warnings",
      "--experimental-permission",
      `--allow-fs-read=${root}`,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
      compositionPath,
    ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 2 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`COMPOSITION_LOAD_FAILED:${signal ?? code}:${stderr.trim().slice(0, 500)}`));
        return;
      }
      try {
        resolvePromise({ raw: stdout, value: JSON.parse(stdout) });
      } catch {
        reject(new Error("COMPOSITION_LOAD_FAILED:default export must be silent and JSON-serializable"));
      }
    });
  });
}

export async function loadCompositionDeterministic(inputRoot) {
  const root = resolve(inputRoot);
  const [first, second] = await Promise.all([loadOnce(root), loadOnce(root)]);
  if (first.raw !== second.raw) throw new Error("COMPOSITION_NONDETERMINISTIC");
  return first.value;
}
