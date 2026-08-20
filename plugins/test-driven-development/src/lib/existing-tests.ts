import { lstatSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  classifyPath,
  extractTestEvidence,
  isSkippedPath,
  resolveLanguageContext,
  sourceAuthorizedByTest,
  type LanguageContext,
  type SourceLike,
} from "./patterns.js";

const MAX_TEST_BYTES = 1_048_576;

function readLimited(path: string): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_TEST_BYTES) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function listTestFiles(root: string, language: string): string[] {
  const workspace = resolve(root);
  const found: string[] = [];
  const stack = [workspace];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === undefined) continue;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const absolutePath = join(directory, entry.name);
      const path = relative(workspace, absolutePath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (isSkippedPath(`${path}/`)) continue;
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const classified = classifyPath(path);
      if (classified.kind === "test" && classified.language === language) found.push(path);
    }
  }
  return found.sort();
}

export function findCorrespondingTests(root: string, source: SourceLike | null | undefined, context: LanguageContext = {}): string[] {
  if (!source?.path || !source.language) return [];
  const found: string[] = [];
  for (const path of listTestFiles(root, source.language)) {
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, readLimited(resolve(root, path)), path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context)) {
      found.push(path);
    }
  }
  return found;
}

export function formatTestPathList(paths: Array<string | null | undefined> | null | undefined): string {
  const values = [...new Set((paths ?? []).filter((value): value is string => Boolean(value)))];
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 4).join(", ")} and ${values.length - 4} more`;
}
