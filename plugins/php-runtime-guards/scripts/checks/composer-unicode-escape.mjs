/**
 * composer.json Chinese Unicode escape guard (PreToolUse).
 *
 * Chinese text written as JSON \uXXXX escapes is hard to review and can
 * conceal unintended textual changes. User-facing Chinese in composer.json
 * must stay as literal UTF-8 characters.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

import { isComposerJson, multiEditNewStrings, stringInput } from "../lib/composer-utils.mjs";

const JSON_UNICODE_ESCAPE = /\\u([0-9a-fA-F]{4})/g;

function isJsonUnicodeEscapeStart(text, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    slashCount++;
  }
  return slashCount % 2 === 0;
}

function isCjkCodePoint(codePoint) {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) ||
    (codePoint >= 0x2a700 && codePoint <= 0x2b73f) ||
    (codePoint >= 0x2b740 && codePoint <= 0x2b81f) ||
    (codePoint >= 0x2b820 && codePoint <= 0x2ceaf) ||
    (codePoint >= 0x2ceb0 && codePoint <= 0x2ebef) ||
    (codePoint >= 0x30000 && codePoint <= 0x323af)
  );
}

function decodeCodePoint(codeUnit, nextEscape) {
  if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
    const next = nextEscape?.match(/^\\u([0-9a-fA-F]{4})/);
    if (!next) return null;
    const low = Number.parseInt(next[1] ?? "", 16);
    if (low < 0xdc00 || low > 0xdfff) return null;
    return {
      codePoint: 0x10000 + ((codeUnit - 0xd800) << 10) + (low - 0xdc00),
      escape: `\\u${codeUnit.toString(16).padStart(4, "0")}${next[0]}`,
    };
  }

  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return null;
  return {
    codePoint: codeUnit,
    escape: `\\u${codeUnit.toString(16).padStart(4, "0")}`,
  };
}

function collectCjkUnicodeEscapes(text, source) {
  if (typeof text !== "string") return [];
  const hits = [];

  JSON_UNICODE_ESCAPE.lastIndex = 0;
  let match;
  while ((match = JSON_UNICODE_ESCAPE.exec(text)) !== null) {
    if (!isJsonUnicodeEscapeStart(text, match.index)) continue;

    const codeUnit = Number.parseInt(match[1] ?? "", 16);
    const nextStart = match.index + match[0].length;
    const decoded = decodeCodePoint(codeUnit, text.slice(nextStart, nextStart + 6));
    if (!decoded || !isCjkCodePoint(decoded.codePoint)) continue;

    hits.push({
      source,
      escape: decoded.escape,
      char: String.fromCodePoint(decoded.codePoint),
    });
  }

  return hits;
}

function collectPatchHits(patch) {
  if (typeof patch !== "string") return [];
  const hits = [];
  let current = "";
  let relevant = false;
  let lineNumber = 0;

  for (const line of patch.split("\n")) {
    lineNumber++;
    const fileMatch = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
    if (fileMatch) {
      current = (fileMatch[1] ?? "").trim();
      relevant = isComposerJson(current);
      continue;
    }

    const moveMatch = line.match(/^\*\*\*\s+Move to:\s+(.+)$/);
    if (moveMatch) {
      current = (moveMatch[1] ?? "").trim();
      relevant = isComposerJson(current);
      continue;
    }

    if (relevant && line.startsWith("+") && !line.startsWith("+++")) {
      hits.push(...collectCjkUnicodeEscapes(line, `patch:${current}:${lineNumber}`));
    }
  }

  return hits;
}

function canonicalToolName(toolName) {
  if (typeof toolName !== "string") return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell",
    create_file: "Write",
    search_replace: "Edit",
  };
  return map[lower] || toolName;
}

export function collectUnicodeEscapeHits({ toolName, input }) {
  const hits = [];
  const name = canonicalToolName(toolName);

  switch (name) {
    case "Write":
      if (isComposerJson(input.file_path)) {
        hits.push(...collectCjkUnicodeEscapes(input.content, "tool_input.content"));
      }
      break;

    case "Edit":
      if (isComposerJson(input.file_path)) {
        hits.push(...collectCjkUnicodeEscapes(input.new_string, "tool_input.new_string"));
      }
      break;

    case "MultiEdit":
      if (isComposerJson(input.file_path)) {
        multiEditNewStrings(input.edits).forEach((text, index) => {
          hits.push(...collectCjkUnicodeEscapes(text, `tool_input.edits[${index}].new_string`));
        });
      }
      break;

    case "ApplyPatch":
      [input.command, input.input, input.patch].forEach((value) => {
        hits.push(...collectPatchHits(stringInput(value)));
      });
      break;

    case "Bash":
    case "Shell": {
      const command = stringInput(input.command ?? input.cmd);
      if (/composer\.json/.test(command)) {
        hits.push(...collectCjkUnicodeEscapes(command, "tool_input.command"));
      }
      break;
    }

    default:
      break;
  }

  return hits;
}

export function unicodeEscapeDenyMessage(toolName, hits) {
  const examples = hits
    .slice(0, 5)
    .map((hit) => `${hit.source}: ${hit.escape} -> ${hit.char}`);
  const suffix = hits.length > examples.length ? ` 等共 ${hits.length} 处` : "";

  return [
    "[Composer Unicode Escape Guard] 检测到 composer.json 中存在表示中文的 JSON Unicode escape，已阻止本次工具调用。",
    "",
    `工具: ${typeof toolName === "string" ? toolName : "(unknown)"}`,
    "composer.json 中的用户可见中文必须保留真实中文字符，不要写成 \\uXXXX 转义。",
    "请把命中的 Unicode escape 改成真实中文后再继续。",
    `命中位置: ${examples.join("、")}${suffix}`,
    "",
    "blockingContract:",
    "  observedFacts: 提议的 composer.json 变更把中文文本编码为 JSON Unicode 转义序列。",
    "  harm: 转义后的面向用户元数据难以审查，可能掩盖无意的文本变更。",
    "  unblockWhen: 在同一份合法 composer.json 中以字面 UTF-8 字符书写相同的中文。",
    "  recovery: 将命中的转义替换为可读字符，保持 JSON 语义，并在重试前校验文件。",
  ].join("\n");
}
