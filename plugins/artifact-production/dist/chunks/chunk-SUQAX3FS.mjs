// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b

// plugins/artifact-production/src/domains/presentation/lib/office.ts
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
function runTool(binary, args, { cwd, timeoutMs = 12e4, maxBytes = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) reject(new Error(`TOOL_TIMEOUT:${binary}`));
      settled = true;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxBytes) child.kill("SIGKILL");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.concat(stderr).byteLength < maxBytes) stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`TOOLCHAIN_UNAVAILABLE:${binary}:${error.message}`));
      settled = true;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (outputBytes > maxBytes) {
        reject(new Error(`TOOL_OUTPUT_LIMIT:${binary}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`TOOL_FAILED:${binary}:${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}
async function toolVersion(binary, args = ["--version"]) {
  const output = await runTool(binary, args, { maxBytes: 1024 * 1024, timeoutMs: 15e3 });
  return (output.toString("utf8").split(/\r?\n/u)[0] ?? "").trim();
}
async function pdfPageCount(pdfPath, { pdfinfo = "pdfinfo", cwd } = {}) {
  const output = await runTool(pdfinfo, [pdfPath], { ...cwd === void 0 ? {} : { cwd }, timeoutMs: 3e4 });
  const match = output.toString("utf8").match(/^Pages:\s+([0-9]+)$/mu);
  if (!match) throw new Error("PDFINFO_PAGE_COUNT_MISSING");
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0) throw new Error("PDF_PAGE_COUNT_INVALID");
  return count;
}
async function pageInventory(directory) {
  const names = (await readdir(directory)).filter((name) => /^page-[0-9]+\.png$/u.test(name)).sort((a, b) => Number(a.match(/[0-9]+/u)?.[0]) - Number(b.match(/[0-9]+/u)?.[0]));
  const pages = [];
  for (const [index, name] of names.entries()) {
    const bytes = await readFile(join(directory, name));
    pages.push({ index: index + 1, sourceName: name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength });
  }
  return pages;
}
async function renderOfficePages(pptxPath, outputDirectory, { soffice = "soffice", pdftoppm = "pdftoppm", cwd } = {}) {
  const runOptions = { ...cwd === void 0 ? {} : { cwd }, timeoutMs: 18e4 };
  const userInstallation = pathToFileURL(join(outputDirectory, "libreoffice-profile")).href;
  await runTool(soffice, [`-env:UserInstallation=${userInstallation}`, "--headless", "--convert-to", "pdf", "--outdir", outputDirectory, pptxPath], runOptions);
  const pdfPath = join(outputDirectory, `${basename(pptxPath, ".pptx")}.pdf`);
  await runTool(pdftoppm, ["-png", "-r", "144", pdfPath, join(outputDirectory, "page")], runOptions);
  return { pdfPath, pages: await pageInventory(outputDirectory) };
}

export {
  toolVersion,
  pdfPageCount,
  renderOfficePages
};
