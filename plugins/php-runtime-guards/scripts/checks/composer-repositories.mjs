/**
 * composer.json `repositories` key guard (PreToolUse).
 *
 * A package-level `repositories` key bypasses the governed registry and pulls
 * in unvetted external sources. We detect the literal top-level config flag in
 * proposed writes, not code semantics.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

import { isComposerJson, multiEditNewStrings, stringInput } from "../lib/composer-utils.mjs";

const REPOSITORIES_KEY = /"repositories"\s*:/;

function addsRepositoriesKey(text) {
  return typeof text === "string" && REPOSITORIES_KEY.test(text);
}

// apply_patch only inspects added lines (leading +, excluding +++ header),
// attributed per `*** File` / `Move to` section.
function collectPatchHits(patch) {
  if (typeof patch !== "string") return [];
  const hits = [];
  let current = "";
  let relevant = false;

  for (const line of patch.split("\n")) {
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

    if (relevant && line.startsWith("+") && !line.startsWith("+++") && REPOSITORIES_KEY.test(line)) {
      hits.push(`patch:${current}`);
    }
  }

  return hits;
}

function collectBashHits(command) {
  if (typeof command !== "string") return [];
  const hits = [];

  // `composer config repositories` writes to the local composer.json; allow
  // --unset / --list / --global.
  const isComposerConfig = /\bcomposer\b[^\n]*\bconfig\b/.test(command);
  const touchesRepositories = /\brepo(?:sitories)?\b/.test(command);
  const isRemovalOrGlobal = /--unset|--list|--global|\s-g(?:\s|$)/.test(command);
  if (isComposerConfig && touchesRepositories && !isRemovalOrGlobal) {
    hits.push("composer config repositories");
  }

  // Redirect / tee / heredoc that writes `"repositories":` into composer.json.
  if (/composer\.json/.test(command) && REPOSITORIES_KEY.test(command)) {
    hits.push("写入 composer.json");
  }

  return hits;
}

export function collectRepositoriesHits({ toolName, input }) {
  const hits = [];

  switch (toolName) {
    case "Write":
      if (isComposerJson(input.file_path) && addsRepositoriesKey(input.content)) {
        hits.push("tool_input.content");
      }
      break;

    case "Edit":
      if (isComposerJson(input.file_path) && addsRepositoriesKey(input.new_string)) {
        hits.push("tool_input.new_string");
      }
      break;

    case "MultiEdit":
      if (isComposerJson(input.file_path)) {
        multiEditNewStrings(input.edits).forEach((text, index) => {
          if (REPOSITORIES_KEY.test(text)) {
            hits.push(`tool_input.edits[${index}].new_string`);
          }
        });
      }
      break;

    case "ApplyPatch":
      [input.command, input.input, input.patch].forEach((value) => {
        collectPatchHits(stringInput(value)).forEach((hit) => hits.push(hit));
      });
      break;

    case "Bash":
    case "Shell":
      collectBashHits(stringInput(input.command)).forEach((hit) => hits.push(hit));
      break;

    default:
      break;
  }

  return [...new Set(hits)];
}

export function repositoriesDenyMessage(toolName, hits) {
  return [
    "[Composer Repositories Guard] 检测到在 composer.json 中配置 repositories，已阻止本次工具调用。",
    "",
    `工具: ${typeof toolName === "string" ? toolName : "(unknown)"}`,
    "包内 composer.json 声明 repositories 会绕过统一依赖 registry，引入未经治理的外部源。",
    "请把对应仓库发布到统一 registry，再用普通 require 引用精确版本号。",
    `命中位置: ${hits.join(", ")}`,
    "",
    "blockingContract:",
    "  observedFacts: 提议的包级 composer.json 变更在统一治理的 registry 配置之外新增了 repositories 键。",
    "  harm: 包级 repositories 可绕过依赖来源管控，使整个工作区的解析结果不一致。",
    "  unblockWhen: 移除包级 repositories 条目，并在指定的工作区或环境边界配置已批准的 registry。",
    "  recovery: 还原 repositories 字段，校验 composer.json，并针对受治理 registry 重新执行依赖解析。",
  ].join("\n");
}
