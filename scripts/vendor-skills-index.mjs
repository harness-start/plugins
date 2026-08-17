#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  console.error("Usage: vendor-skills-index.mjs <write|verify> --root <repo> [--vendor <dir>]");
}

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseArgs(argv) {
  const command = argv[2];
  let root = "";
  let vendor = "";

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      root = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--vendor") {
      vendor = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!new Set(["write", "verify"]).has(command) || root.length === 0) {
    usage();
    process.exitCode = 2;
    return null;
  }

  const resolvedRoot = path.resolve(root);
  return {
    command,
    root: resolvedRoot,
    vendor: path.resolve(vendor || path.join(resolvedRoot, "vendor-skills")),
  };
}

async function declaredSkills(root) {
  const pluginsRoot = path.join(root, "plugins");
  const pluginEntries = await readdir(pluginsRoot, { withFileTypes: true });
  const identities = new Map();

  for (const pluginEntry of pluginEntries.sort((left, right) => compareNames(left.name, right.name))) {
    if (!pluginEntry.isDirectory()) continue;
    const manifest = path.join(pluginsRoot, pluginEntry.name, "skill-deps.json");
    let payload;
    try {
      payload = JSON.parse(await readFile(manifest, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`cannot read ${manifest}: ${error.message}`);
    }
    if (!payload || !Array.isArray(payload.skills)) {
      throw new Error(`${manifest}: root must contain a skills array`);
    }
    for (const skill of payload.skills) {
      if (
        !skill
        || typeof skill.name !== "string"
        || !/^[A-Za-z0-9._-]+$/.test(skill.name)
        || typeof skill.source !== "string"
        || !skill.source.startsWith("https://")
      ) {
        throw new Error(`${manifest}: every skill needs a safe name and HTTPS source`);
      }
      const prior = identities.get(skill.name);
      if (prior && prior !== skill.source) {
        throw new Error(`Skill identity conflict for ${skill.name}: ${prior} vs ${skill.source}`);
      }
      identities.set(skill.name, skill.source);
    }
  }

  return [...identities]
    .map(([name, source]) => ({ name, source }))
    .sort((left, right) => compareNames(left.name, right.name));
}

async function skillFiles(skillRoot) {
  const files = [];

  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareNames(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (/[\0\r\n\t]/.test(relative)) {
        throw new Error(`vendored Skill paths cannot contain control characters: ${absolute}`);
      }
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`vendored Skills cannot contain symlinks: ${absolute}`);
      }
      if (stat.isDirectory()) {
        await visit(absolute, relative);
      } else if (stat.isFile()) {
        const content = await readFile(absolute);
        files.push({
          path: relative,
          sha256: createHash("sha256").update(content).digest("hex"),
          size: content.length,
          content,
        });
      } else {
        throw new Error(`vendored Skills can contain only files and directories: ${absolute}`);
      }
    }
  }

  await visit(skillRoot);
  return files;
}

async function expectedIndex(root, vendor) {
  const skills = [];
  for (const declaration of await declaredSkills(root)) {
    const skillRoot = path.join(vendor, declaration.name);
    const skillStat = await lstat(skillRoot).catch(() => null);
    if (!skillStat?.isDirectory()) {
      throw new Error(`vendored Skill directory missing: ${skillRoot}`);
    }
    const skillMd = await lstat(path.join(skillRoot, "SKILL.md")).catch(() => null);
    if (!skillMd?.isFile()) {
      throw new Error(`vendored Skill is missing SKILL.md: ${skillRoot}`);
    }

    const files = await skillFiles(skillRoot);
    const digest = createHash("sha256");
    for (const file of files) {
      digest.update(file.path, "utf8");
      digest.update("\0");
      digest.update(file.content);
      digest.update("\0");
    }
    skills.push({
      ...declaration,
      sha256: digest.digest("hex"),
      files: files.map(({ content: _content, ...file }) => file),
    });
  }

  const declaredNames = new Set(skills.map(({ name }) => name));
  const vendorEntries = await readdir(vendor, { withFileTypes: true });
  for (const entry of vendorEntries) {
    if (entry.name === "index.json") continue;
    if (!entry.isDirectory() || !declaredNames.has(entry.name)) {
      throw new Error(`undeclared entry in vendor-skills: ${path.join(vendor, entry.name)}`);
    }
  }

  return { schemaVersion: 1, skills };
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options) return;
  const index = await expectedIndex(options.root, options.vendor);
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  const indexPath = path.join(options.vendor, "index.json");

  if (options.command === "write") {
    await mkdir(options.vendor, { recursive: true });
    await writeFile(indexPath, serialized, "utf8");
    console.log(`Wrote ${index.skills.length} vendored Skill entries to ${indexPath}`);
    return;
  }

  const actual = await readFile(indexPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`vendor index missing: ${indexPath}`);
    throw error;
  });
  if (actual !== serialized) {
    throw new Error(`vendor index is stale or content digests differ: ${indexPath}`);
  }
  console.log(`Verified ${index.skills.length} vendored Skill entries in ${indexPath}`);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
