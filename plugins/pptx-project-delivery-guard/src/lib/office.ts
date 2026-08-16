import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

type RunOptions = { cwd?: string; timeoutMs?: number; maxBytes?: number };

export function runTool(binary: string, args: readonly string[], { cwd, timeoutMs = 120_000, maxBytes = 16 * 1024 * 1024 }: RunOptions = {}) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => { child.kill("SIGKILL"); if (!settled) reject(new Error(`TOOL_TIMEOUT:${binary}`)); settled = true; }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { outputBytes += chunk.byteLength; if (outputBytes > maxBytes) child.kill("SIGKILL"); else stdout.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { if (Buffer.concat(stderr).byteLength < maxBytes) stderr.push(chunk); });
    child.on("error", (error) => { clearTimeout(timer); if (!settled) reject(new Error(`TOOLCHAIN_UNAVAILABLE:${binary}:${error.message}`)); settled = true; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (outputBytes > maxBytes) { reject(new Error(`TOOL_OUTPUT_LIMIT:${binary}`)); return; }
      if (code !== 0) { reject(new Error(`TOOL_FAILED:${binary}:${Buffer.concat(stderr).toString("utf8").trim()}`)); return; }
      resolve(Buffer.concat(stdout));
    });
  });
}

export async function toolVersion(binary: string, args: readonly string[] = ["--version"]) {
  const output = await runTool(binary, args, { maxBytes: 1024 * 1024, timeoutMs: 15_000 });
  return (output.toString("utf8").split(/\r?\n/u)[0] ?? "").trim();
}

export async function pdfPageCount(pdfPath: string, { pdfinfo = "pdfinfo", cwd }: { pdfinfo?: string; cwd?: string } = {}) {
  const output = await runTool(pdfinfo, [pdfPath], { ...(cwd === undefined ? {} : { cwd }), timeoutMs: 30_000 });
  const match = output.toString("utf8").match(/^Pages:\s+([0-9]+)$/mu);
  if (!match) throw new Error("PDFINFO_PAGE_COUNT_MISSING");
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0) throw new Error("PDF_PAGE_COUNT_INVALID");
  return count;
}

export async function pageInventory(directory: string) {
  const names = (await readdir(directory)).filter((name) => /^page-[0-9]+\.png$/u.test(name)).sort((a, b) => Number(a.match(/[0-9]+/u)?.[0]) - Number(b.match(/[0-9]+/u)?.[0]));
  const pages = [];
  for (const [index, name] of names.entries()) {
    const bytes = await readFile(join(directory, name));
    pages.push({ index: index + 1, sourceName: name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength });
  }
  return pages;
}

export async function renderOfficePages(pptxPath: string, outputDirectory: string, { soffice = "soffice", pdftoppm = "pdftoppm", cwd }: { soffice?: string; pdftoppm?: string; cwd?: string } = {}) {
  const runOptions = { ...(cwd === undefined ? {} : { cwd }), timeoutMs: 180_000 };
  const userInstallation = pathToFileURL(join(outputDirectory, "libreoffice-profile")).href;
  await runTool(soffice, [`-env:UserInstallation=${userInstallation}`, "--headless", "--convert-to", "pdf", "--outdir", outputDirectory, pptxPath], runOptions);
  const pdfPath = join(outputDirectory, `${basename(pptxPath, ".pptx")}.pdf`);
  await runTool(pdftoppm, ["-png", "-r", "144", pdfPath, join(outputDirectory, "page")], runOptions);
  return { pdfPath, pages: await pageInventory(outputDirectory) };
}
