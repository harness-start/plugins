import { isAbsolute, relative, resolve } from "node:path";

export function pathUnderRoot(filePath: string, rootAbs: string): boolean {
  const rel = relative(resolve(rootAbs), resolve(filePath)).replaceAll("\\", "/");
  return rel === "" || (!rel.startsWith("../") && !isAbsolute(rel));
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function commandMentionsRoot(command: string, rootRel: string, rootAbs: string): boolean {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  const normalized = String(rootRel ?? "").replace(/^\.\//u, "").replace(/\/+$/u, "");
  const markers = [rootRel, normalized, rootAbs, normalized ? `${normalized}/` : null, normalized ? `./${normalized}` : null, normalized ? `./${normalized}/` : null].filter(Boolean) as string[];
  return markers.some((marker) => new RegExp(
    `(?:^|[\\s;|&\`"'(){}\\[\\]])${escapeRegExp(marker)}(?:$|[\\s;|&\`"'(){}\\[\\]//])`,
    "u",
  ).test(text));
}

export function isGenericMutationCommand(command: string): boolean {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  if (/(?:^|[^0-9])>{1,2}\s*(?:"[^"]*"|'[^']*'|\S+)/u.test(text)) return true;
  if (/<<\s*['"]?\w+/u.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:\/(?:usr\/)?bin\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])find\b[\s\S]*\s-delete\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])git\s+clean\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])sed\s+(?:-i\b|\S*i\S*\b)/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:perl|ruby|python3?)\s+[^\n]*\s-i\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:node(?:js)?|deno|bun|perl|ruby|php|lua|python3?)\b/iu.test(text)) return true;
  return false;
}