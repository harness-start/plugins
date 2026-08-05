/**
 * PHP encoding guard (PostToolUse).
 *
 * Detects BOM headers and non-UTF-8 byte sequences in .php, .twig and
 * .blade.php files. Modern projects should use BOM-less UTF-8.
 *
 * Failure mode: fail-open (report).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

export const MAX_HOOK_READ_BYTES = 2 * 1024 * 1024;

const TARGETS = {
  extensions: new Set([".php", ".twig"]),
  suffixes: [".blade.php"],
};

const BOM_SIGNATURES = [
  { name: "UTF-8 BOM", bytes: [0xef, 0xbb, 0xbf] },
  { name: "UTF-16 LE BOM", bytes: [0xff, 0xfe] },
  { name: "UTF-16 BE BOM", bytes: [0xfe, 0xff] },
  { name: "UTF-32 LE BOM", bytes: [0xff, 0xfe, 0x00, 0x00] },
  { name: "UTF-32 BE BOM", bytes: [0x00, 0x00, 0xfe, 0xff] },
];

export function matches(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/").toLowerCase();
  const baseName = basename(normalizedPath);
  if (TARGETS.suffixes.some((suffix) => normalizedPath.endsWith(suffix))) return true;
  const ext = extname(baseName).toLowerCase();
  return TARGETS.extensions.has(ext);
}

function findInvalidUtf8(buffer) {
  const positions = [];
  let i = 0;
  const byte = (index) => buffer[index] ?? 0;

  if (
    buffer.length >= 3 &&
    byte(0) === 0xef &&
    byte(1) === 0xbb &&
    byte(2) === 0xbf
  ) {
    i = 3;
  }

  while (i < buffer.length && positions.length < 20) {
    const b = byte(i);
    if (b <= 0x7f) {
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      if (i + 1 >= buffer.length || (byte(i + 1) & 0xc0) !== 0x80) {
        positions.push(i);
        i++;
        continue;
      }
      const cp = ((b & 0x1f) << 6) | (byte(i + 1) & 0x3f);
      if (cp < 0x80) {
        positions.push(i);
        i += 2;
        continue;
      }
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      if (
        i + 2 >= buffer.length ||
        (byte(i + 1) & 0xc0) !== 0x80 ||
        (byte(i + 2) & 0xc0) !== 0x80
      ) {
        positions.push(i);
        i++;
        continue;
      }
      const cp =
        ((b & 0x0f) << 12) |
        ((byte(i + 1) & 0x3f) << 6) |
        (byte(i + 2) & 0x3f);
      if (cp < 0x800) {
        positions.push(i);
        i += 3;
        continue;
      }
      i += 3;
    } else if ((b & 0xf8) === 0xf0) {
      if (
        i + 3 >= buffer.length ||
        (byte(i + 1) & 0xc0) !== 0x80 ||
        (byte(i + 2) & 0xc0) !== 0x80 ||
        (byte(i + 3) & 0xc0) !== 0x80
      ) {
        positions.push(i);
        i++;
        continue;
      }
      const cp =
        ((b & 0x07) << 18) |
        ((byte(i + 1) & 0x3f) << 12) |
        ((byte(i + 2) & 0x3f) << 6) |
        (byte(i + 3) & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) {
        positions.push(i);
        i += 4;
        continue;
      }
      i += 4;
    } else {
      positions.push(i);
      i++;
    }
  }

  return positions;
}

/** Returns an array of issue strings, or [] when the file is clean. */
export function check(filePath) {
  if (!existsSync(filePath)) return [];
  if (!matches(filePath)) return [];

  try {
    if (statSync(filePath).size > MAX_HOOK_READ_BYTES) return [];
  } catch {
    return [];
  }

  const buf = readFileSync(filePath);
  if (buf.length === 0) return [];

  const issues = [];

  for (const sig of BOM_SIGNATURES) {
    if (buf.length >= sig.bytes.length && sig.bytes.every((b, idx) => buf[idx] === b)) {
      issues.push(
        `检测到 ${sig.name}（${sig.bytes.map((b) => `0x${b.toString(16).toUpperCase()}`).join(" ")}）— 现代项目通常使用无 BOM 的 UTF-8`,
      );
      break;
    }
  }

  const firstIssue = issues[0];
  const isNonUtf8Bom = firstIssue !== undefined && !firstIssue.startsWith("检测到 UTF-8");
  if (!isNonUtf8Bom) {
    const invalidPositions = findInvalidUtf8(buf);
    if (invalidPositions.length > 0) {
      const lineNumbers = invalidPositions.slice(0, 5).map((pos) => {
        let line = 1;
        for (let i = 0; i < pos && i < buf.length; i++) {
          if (buf[i] === 0x0a) line++;
        }
        const byte = buf[pos] ?? 0;
        return `行 ${line} (偏移 0x${pos.toString(16).toUpperCase()}: 0x${byte.toString(16).toUpperCase().padStart(2, "0")})`;
      });
      const suffix = invalidPositions.length > 5 ? ` 等共 ${invalidPositions.length} 处` : "";
      issues.push(`发现非 UTF-8 字节序列：${lineNumbers.join("、")}${suffix}`);
    }
  }

  return issues;
}

export function formatReport(filePath, issues) {
  return [
    `[PHP Encoding Guard] ${filePath} 编码问题：`,
    ...issues.map((issue) => `  • ${issue}`),
    "",
    "建议使用无 BOM 的 UTF-8 编码，避免跨平台兼容性问题。",
  ].join("\n");
}
