import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

type LibraryStyle = { key: string; label?: string; description?: string };
type LibraryCard = {
  name: string;
  summary?: string;
  use?: string;
  duration?: string;
  energy?: string;
  intention?: string;
  category: string;
  tags?: string[];
  source: string;
  styles: LibraryStyle[];
};

type SourceStyle = {
  id: string;
  label: string;
  description: string;
  status: "executable" | "reference-only";
  upstreamPath: string | null;
  sourceSha256: string | null;
  dependencyPaths: string[];
};

const EXPECTED_COMMIT = "0d6f0b57f0d4d6700761644c07f7ef03c3e50234";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const projectRoot = resolve(import.meta.dirname, "..");

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizedPath(root: string, path: string) {
  return relative(root, path).split(sep).join("/");
}

function replaceBetween(source: string, start: string, end: string, replacement: string) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return source;
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) throw new Error(`NORMALIZATION_MARKER_MISSING:${start}`);
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex + end.length)}`;
}

async function filesUnder(root: string, accepted: Set<string>): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path, accepted));
    else if ([...accepted].some((extension) => entry.name.endsWith(extension))) found.push(path);
  }
  return found.toSorted();
}

function freezeFontMetrics(path: string, source: string) {
  if (path.endsWith("ChipGridSingleSelectBlackout.tsx")) {
    return replaceBetween(
      source.replace("import React, { useLayoutEffect, useRef, useState } from 'react';", "import React from 'react';"),
      "  const targetRef = useRef<HTMLDivElement>(null);",
      "  }, []);",
      "  const cx = 149;",
    ).replace("\n                    ref={i === TI ? targetRef : undefined}", "");
  }
  if (path.endsWith("GlassPillDictationTyping.tsx")) {
    return replaceBetween(
      source.replace("import React, { useLayoutEffect, useRef, useState } from 'react';", "import React from 'react';"),
      "  const measRef = useRef<HTMLDivElement>(null);",
      "  }, []);",
      "  const textW = 180;",
    ).replace("\n          ref={measRef}", "");
  }
  if (path.endsWith("PillChipSlotCycleHandled.tsx")) {
    return replaceBetween(
      source.replace("import React, { useLayoutEffect, useRef, useState } from 'react';", "import React from 'react';"),
      "  const measRef = useRef<HTMLDivElement>(null);",
      "  }, []);",
      "  const widths = FALLBACK_WIDTHS;",
    ).replace("<div ref={measRef} style={{ position: 'absolute', visibility: 'hidden' }}>", "<div style={{ position: 'absolute', visibility: 'hidden' }}>");
  }
  return source;
}

function normalizeSource(path: string, source: string) {
  const syntheticTexture = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'%3E%3Crect width='1920' height='1080' fill='%23101114'/%3E%3Crect x='160' y='120' width='1600' height='840' rx='48' fill='%2321262f'/%3E%3Cpath d='M260 300h720M260 390h1120M260 480h900' stroke='%235eead4' stroke-width='18' opacity='.75'/%3E%3C/svg%3E";
  const withoutExternalTextures = source.replace(/staticFile\([^)]*\)/gu, JSON.stringify(syntheticTexture));
  const fixedMetrics = freezeFontMetrics(path, withoutExternalTextures);
  return `// Adapted from video-shotcraft ${EXPECTED_COMMIT}; see licenses/video-shotcraft/NOTICE.md.\n${fixedMetrics}`;
}

function referenceSection(markdown: string) {
  return markdown.split(/^## 参考实现\s*$/mu)[1] ?? "";
}

async function sourceCandidates(root: string, markdown: string) {
  const section = referenceSection(markdown);
  const direct = [...section.matchAll(/(?:demos|template\/src|assets\/lib)\/[A-Za-z0-9_./-]+\.tsx/gu)].map((match) => match[0]);
  const directory = section.match(/(demos\/[A-Za-z0-9_./-]+\/)/u)?.[1];
  let candidates = [...new Set(direct)];
  if (directory) {
    const names = [...section.matchAll(/([A-Za-z0-9_-]+\.tsx)/gu)].map((match) => match[1] ?? "");
    candidates = names.length > 0
      ? [...new Set(names.map((name) => posix.join(directory, name)))]
      : (await readdir(join(root, directory))).filter((name) => name.endsWith(".tsx")).toSorted().map((name) => posix.join(directory, name));
  }
  const existing: string[] = [];
  for (const path of candidates) {
    try {
      if ((await stat(join(root, path))).isFile()) existing.push(path);
    } catch {
      // References can describe an implementation that is not shipped.
    }
  }
  return existing.filter((path) => !path.endsWith("/Main.tsx") && !path.startsWith("assets/lib/"));
}

function styleSources(card: LibraryCard, candidates: string[]): Array<string[]> {
  if (card.name === "crash-zoom-punch") return [[...candidates].toSorted((left, right) => Number(right.includes("CrashZoom")) - Number(left.includes("CrashZoom")))];
  if (card.name === "page-waterfall-wall") return [["demos/ui-entrance/page-waterfall-wall/PageWaterfallWall.tsx"]];
  if (card.name === "shot-transitions") {
    return card.styles.map((style) => {
      if (style.key === "flash-cut") return [];
      if (style.key === "whip-pan") return candidates.filter((path) => /Whip(?:Pan|Brake)Real\.tsx$/u.test(path));
      if (style.key === "mask-wipe") return candidates.filter((path) => /(?:MaskWipeReal|PortalWipeV2)\.tsx$/u.test(path));
      return [];
    });
  }
  if (candidates.length === 1) return card.styles.map(() => candidates);
  if (candidates.length === card.styles.length) return candidates.map((path) => [path]);
  return card.styles.map((style) => {
    const key = style.key.replace(/[^a-z0-9]/gu, "").toLowerCase();
    const match = candidates.find((path) => path.split("/").at(-1)?.replace(/\.tsx$/u, "").replace(/[^a-z0-9]/giu, "").toLowerCase().includes(key));
    return match ? [match] : [];
  });
}

function importSpecifiers(source: string) {
  return [...source.matchAll(/from\s+["'](\.[^"']+)["']/gu)].map((match) => match[1] ?? "");
}

function dependencyClosure(path: string, files: Record<string, string>) {
  const pending = [path];
  const found = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || found.has(current) || !(current in files)) continue;
    found.add(current);
    const base = posix.dirname(current);
    for (const specifier of importSpecifiers(files[current] ?? "")) {
      const resolved = posix.normalize(posix.join(base, specifier));
      const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.json`, posix.join(resolved, "index.ts"), posix.join(resolved, "index.tsx")];
      const dependency = candidates.find((candidate) => candidate in files);
      if (dependency) pending.push(dependency);
    }
  }
  return [...found].toSorted();
}

async function main() {
  const sourceRoot = resolve(argument("--source") ?? "");
  const commit = argument("--commit");
  const output = resolve(argument("--output") ?? join(projectRoot, "plugins/video-production/src/generated/shot-library-data.ts"));
  if (commit !== EXPECTED_COMMIT) throw new Error(`UPSTREAM_COMMIT_MISMATCH:${commit ?? "missing"}`);

  const library = JSON.parse(await readFile(join(sourceRoot, "gallery/api/library.json"), "utf8")) as { cards: LibraryCard[]; categories: Record<string, unknown> };
  const codeFiles = [
    ...await filesUnder(join(sourceRoot, "demos"), new Set([".ts", ".tsx", ".json"])),
    ...await filesUnder(join(sourceRoot, "template/src"), new Set([".ts", ".tsx", ".json"])),
    ...await filesUnder(join(sourceRoot, "assets/lib"), new Set([".ts", ".tsx", ".json"])),
  ];
  const files: Record<string, string> = {};
  for (const absolute of codeFiles) {
    const path = normalizedPath(sourceRoot, absolute);
    if (path.endsWith(".json")) continue;
    files[path] = normalizeSource(path, await readFile(absolute, "utf8"));
  }

  const recipes = [];
  for (const card of library.cards) {
    const markdown = await readFile(join(sourceRoot, card.source), "utf8");
    const candidates = await sourceCandidates(sourceRoot, markdown);
    const sources = styleSources(card, candidates);
    const styles: SourceStyle[] = card.styles.map((style, index) => {
      const sourcePaths = sources[index] ?? [];
      const primary = sourcePaths[0] ?? null;
      const dependencies = [...new Set(sourcePaths.flatMap((path) => dependencyClosure(path, files)))].toSorted();
      return {
        id: style.key,
        label: style.label ?? style.key,
        description: style.description ?? card.summary ?? "",
        status: primary ? "executable" : "reference-only",
        upstreamPath: primary,
        sourceSha256: primary ? sha256(files[primary] ?? "") : null,
        dependencyPaths: dependencies,
      };
    });
    recipes.push({
      id: card.name,
      category: card.category,
      tags: card.tags ?? [card.category],
      summary: card.summary ?? "",
      use: card.use ?? "",
      duration: card.duration ?? "",
      energy: card.energy ?? "",
      intention: card.intention ?? "",
      markdown,
      upstreamPath: card.source,
      styles,
    });
  }

  const payload = {
    schema: "video-production/shot-library/v1",
    upstream: { repository: "Vincentwei1021/video-shotcraft", commit: EXPECTED_COMMIT, license: "Apache-2.0" },
    categories: Object.keys(library.categories).toSorted(),
    recipes,
    files,
  };
  const encoded = gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64");
  const generated = `// Generated by scripts/sync-video-shot-library.ts.\nexport const SHOT_LIBRARY_GZIP_BASE64 = ${JSON.stringify(encoded)};\n`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generated);
  const licenseDirectory = join(projectRoot, "plugins/video-production/licenses/video-shotcraft");
  await mkdir(licenseDirectory, { recursive: true });
  await writeFile(join(licenseDirectory, "LICENSE"), await readFile(join(sourceRoot, "LICENSE")));
  await writeFile(join(licenseDirectory, "NOTICE.md"), `# video-shotcraft attribution\n\nThe bundled offline shot catalog, recipe text, and normalized source snapshots are derived from [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) at commit \`${EXPECTED_COMMIT}\`, licensed under Apache-2.0.\n\nNormalization replaces external static assets with a synthetic local placeholder, freezes three browser-layout measurements for deterministic rendering, and adds attribution comments. Upstream audio files and other binary assets are not bundled.\n`);
  process.stdout.write(`${JSON.stringify({ output, cards: recipes.length, styles: recipes.reduce((total, recipe) => total + recipe.styles.length, 0), files: Object.keys(files).length })}\n`);
}

await main();
