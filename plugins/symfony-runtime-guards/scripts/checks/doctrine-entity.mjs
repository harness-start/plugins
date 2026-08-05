/**
 * Doctrine entity mapping heuristics (PostToolUse).
 *
 * Checks Doctrine Entity classes for missing ORM mapping attributes and
 * string-literal Column types. Heuristic only: reports, never blocks.
 *
 * Failure mode: fail-open (report).
 */

import { existsSync, readFileSync, statSync } from "node:fs";

export const MAX_HOOK_READ_BYTES = 2 * 1024 * 1024;

export function pathContains(filePath, segment) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const normalizedSegment = segment.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalizedSegment) return false;
  return (
    normalizedPath === normalizedSegment ||
    normalizedPath.startsWith(`${normalizedSegment}/`) ||
    normalizedPath.includes(`/${normalizedSegment}/`) ||
    normalizedPath.endsWith(`/${normalizedSegment}`)
  );
}

export function matches(filePath) {
  return (
    filePath.toLowerCase().endsWith(".php") &&
    pathContains(filePath, "Entity")
  );
}

function readTextFileCapped(filePath) {
  try {
    if (statSync(filePath).size > MAX_HOOK_READ_BYTES) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

const ORM_PROPERTY_ATTRS =
  /ORM\\(Column|Id|OneToMany|ManyToOne|ManyToMany|OneToOne|Embedded|JoinColumn|JoinTable)/;
const PROPERTY_PATTERN =
  /^\s+(private|protected|public)\s+(?!static\s)(?!function\s)(?!const\s)(.+)\s+\$(\w+)/;
const STRING_TYPE_PATTERN = /#\[ORM\\Column\([^)]*type:\s*['"](\w+)['"]/g;

/** Returns an array of issue strings, or [] when clean / not an Entity. */
export function check(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readTextFileCapped(filePath);
  if (content === null) return [];

  // Only Doctrine entities (must carry ORM\Entity or ORM\MappedSuperclass).
  if (!/#\[ORM\\(Entity|MappedSuperclass)/.test(content)) return [];

  const errors = [];

  // Check 1: non-static properties must carry an ORM mapping attribute.
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = (lines[i] ?? "").match(PROPERTY_PATTERN);
    if (!match) continue;

    const propName = match[3];
    let hasOrmAttr = false;
    for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
      const line = lines[j] ?? "";
      if (j < i - 1 && PROPERTY_PATTERN.test(line)) break;
      if (/^\s+(private|protected|public)\s+(static\s+)?function\s/.test(line)) break;
      if (/^\s*class\s/.test(line)) break;
      if (/^\s*\{?\s*$/.test(line) && j < i - 2) break;
      if (ORM_PROPERTY_ATTRS.test(line)) {
        hasOrmAttr = true;
        break;
      }
    }

    if (!hasOrmAttr) {
      errors.push(
        `  属性 \$${propName} (行 ${i + 1}) 缺少 ORM 映射注解（ORM\\Column / ORM\\*ToMany / ORM\\*ToOne 等）`,
      );
    }
  }

  // Check 2: ORM\Column type should use Types:: constants, not string literals.
  STRING_TYPE_PATTERN.lastIndex = 0;
  let typeMatch;
  while ((typeMatch = STRING_TYPE_PATTERN.exec(content)) !== null) {
    const lineNum = content.substring(0, typeMatch.index).split("\n").length;
    const typeName = typeMatch[1] ?? "";
    errors.push(
      `  行 ${lineNum}: ORM\\Column type 使用了字符串 '${typeName}'，应使用 Types::${typeName.toUpperCase()} 常量`,
    );
  }

  return errors;
}

export function formatReport(filePath, errors) {
  return [
    `[Doctrine Entity] ${filePath} 启发式映射检查发现 ${errors.length} 个问题:`,
    "",
    errors.join("\n"),
    "",
    "以上为启发式映射检查提醒，确认为误报可忽略。",
  ].join("\n");
}
