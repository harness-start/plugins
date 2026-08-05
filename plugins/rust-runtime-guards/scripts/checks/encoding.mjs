/**
 * Rust encoding guard (PostToolUse).
 * Failure mode: fail-open (report).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, basename } from "node:path";

export const MAX_HOOK_READ_BYTES = 2 * 1024 * 1024;
const EXTS = new Set([".rs"]);

const BOM_SIGNATURES = [
  { name: "UTF-8 BOM", bytes: [0xef, 0xbb, 0xbf] },
  { name: "UTF-16 LE BOM", bytes: [0xff, 0xfe] },
  { name: "UTF-16 BE BOM", bytes: [0xfe, 0xff] },
];

export function matches(filePath) {
  const ext = extname(basename(filePath)).toLowerCase();
  return EXTS.has(ext);
}

function findBom(buffer) {
  for (const sig of BOM_SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.name;
  }
  return null;
}

function findInvalidUtf8(buffer) {
  let i = 0;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    i = 3;
  }
  const positions = [];
  while (i < buffer.length && positions.length < 10) {
    const b = buffer[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if ((b & 0xe0) === 0xc0 && i + 1 < buffer.length && (buffer[i + 1] & 0xc0) === 0x80) {
      i += 2;
      continue;
    }
    if ((b & 0xf0) === 0xe0 && i + 2 < buffer.length && (buffer[i + 1] & 0xc0) === 0x80 && (buffer[i + 2] & 0xc0) === 0x80) {
      i += 3;
      continue;
    }
    if ((b & 0xf8) === 0xf0 && i + 3 < buffer.length && (buffer[i + 1] & 0xc0) === 0x80 && (buffer[i + 2] & 0xc0) === 0x80 && (buffer[i + 3] & 0xc0) === 0x80) {
      i += 4;
      continue;
    }
    positions.push(i);
    i++;
  }
  return positions;
}

export function check(filePath) {
  if (!existsSync(filePath)) return [];
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return [];
  }
  if (!st.isFile() || st.size > MAX_HOOK_READ_BYTES) return [];
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return [];
  }
  const issues = [];
  const bom = findBom(buffer);
  if (bom) issues.push({ kind: "bom", detail: bom });
  const invalid = findInvalidUtf8(buffer);
  if (invalid.length > 0) {
    issues.push({ kind: "invalid-utf8", detail: `offsets ${invalid.slice(0, 5).join(",")}` });
  }
  return issues;
}

export function formatReport(filePath, issues) {
  return [
    `[Rust Encoding Guard] ${filePath}`,
    ...issues.map((i) => `- ${i.kind}: ${i.detail}`),
    "请使用无 BOM 的 UTF-8 保存源文件。",
  ].join("\n");
}
