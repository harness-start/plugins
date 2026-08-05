/**
 * Twig template syntax check (PostToolUse).
 *
 * Check chain: Symfony `bin/console lint:twig` → twigcs (project bin, then
 * global) → regex tag pairing fallback. Tools unavailable degrade gracefully.
 *
 * Note: the source harness had `bin/node:console` (typo); this port uses
 * `bin/console`.
 *
 * Failure mode: fail-open (report — PostToolUse cannot deny on either host).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hasCommand, runCommand, combinedOutput } from "../lib/process-utils.mjs";

const LINT_TIMEOUT_MS = 8000;
export const MAX_HOOK_READ_BYTES = 2 * 1024 * 1024;

export function matches(filePath) {
  return filePath.toLowerCase().endsWith(".twig");
}

function findUpProjectRoot(filePath, names) {
  let current = dirname(resolve(filePath));
  while (true) {
    if (names.some((name) => existsSync(join(current, name)))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Symfony bin/console lint:twig. Returns:
 *   undefined = tool unavailable, null = passed, string = error message.
 */
async function trySymfonyLint(filePath) {
  if (!hasCommand("php")) return undefined;
  const projectRoot = findUpProjectRoot(filePath, ["composer.json"]);
  if (!projectRoot) return undefined;
  const consolePath = join(projectRoot, "bin", "console");
  if (!existsSync(consolePath)) return undefined;

  const result = await runCommand(
    "php",
    [consolePath, "lint:twig", "--format=txt", "--no-ansi", filePath],
    { cwd: projectRoot, timeoutMs: LINT_TIMEOUT_MS },
  );
  if (result.exitCode === 0) return null;
  const output = combinedOutput(result);
  // lint:twig reports template errors on stdout with ERROR or KO markers.
  if (/\bERROR\b/.test(output) || /\bKO\b/.test(output)) {
    return output.trim();
  }
  // Command startup failure (missing deps etc.) → unavailable.
  return undefined;
}

/** twigcs: project-level vendor/bin/twigcs first, global fallback. */
async function tryTwigcs(filePath) {
  if (hasCommand("php")) {
    const projectRoot = findUpProjectRoot(filePath, ["composer.json"]);
    if (projectRoot) {
      const localBin = join(projectRoot, "vendor", "bin", "twigcs");
      if (existsSync(localBin)) {
        const result = await runCommand("php", [localBin, filePath], {
          cwd: projectRoot,
          timeoutMs: LINT_TIMEOUT_MS,
        });
        if (result.exitCode === 0) return null;
        if (result.errorCode !== "ENOENT" && result.errorCode !== "EACCES") {
          const output = combinedOutput(result);
          if (output.trim()) return output.trim();
        }
      }
    }
  }

  if (!hasCommand("twigcs")) return undefined;
  const result = await runCommand("twigcs", [filePath], {
    timeoutMs: LINT_TIMEOUT_MS,
  });
  if (result.exitCode === 0) return null;
  if (result.errorCode === "ENOENT" || result.errorCode === "EACCES") return undefined;
  const output = combinedOutput(result);
  return output.trim() ? output.trim() : undefined;
}

function readTextFileCapped(filePath) {
  try {
    if (statSync(filePath).size > MAX_HOOK_READ_BYTES) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Regex tag-pairing fallback. Returns {lang, message} or null. */
function checkRegex(filePath) {
  const content = readTextFileCapped(filePath) ?? "";
  const errors = [];

  const openTags = (content.match(/\{%/g) || []).length;
  const closeTags = (content.match(/%\}/g) || []).length;
  if (openTags !== closeTags) {
    errors.push(`Twig 标签不配对：{%% 出现 ${openTags} 次，%%} 出现 ${closeTags} 次`);
  }

  const exprOpen = (content.match(/\{\{/g) || []).length;
  const exprClose = (content.match(/\}\}/g) || []).length;
  if (exprOpen !== exprClose) {
    errors.push(`Twig 表达式不配对：{{ 出现 ${exprOpen} 次，}} 出现 ${exprClose} 次`);
  }

  const blocks = (content.match(/\{%[-~]?\s*block\s/g) || []).length;
  const endblocks = (content.match(/\{%[-~]?\s*endblock/g) || []).length;
  if (blocks !== endblocks) {
    errors.push(`block/endblock 不配对：block ${blocks} 个，endblock ${endblocks} 个`);
  }

  const ifs = (content.match(/\{%[-~]?\s*if\s/g) || []).length;
  const endifs = (content.match(/\{%[-~]?\s*endif/g) || []).length;
  if (ifs !== endifs) {
    errors.push(`if/endif 不配对：if ${ifs} 个，endif ${endifs} 个`);
  }

  const fors = (content.match(/\{%[-~]?\s*for\s/g) || []).length;
  const endfors = (content.match(/\{%[-~]?\s*endfor/g) || []).length;
  if (fors !== endfors) {
    errors.push(`for/endfor 不配对：for ${fors} 个，endfor ${endfors} 个`);
  }

  const macros = (content.match(/\{%[-~]?\s*macro\s/g) || []).length;
  const endmacros = (content.match(/\{%[-~]?\s*endmacro/g) || []).length;
  if (macros !== endmacros) {
    errors.push(`macro/endmacro 不配对：macro ${macros} 个，endmacro ${endmacros} 个`);
  }

  if (errors.length === 0) return null;
  return { lang: "Twig Template", message: errors.join("\n") };
}

/** Returns {lang, message} failure or null. */
export async function check(filePath) {
  // 1. Symfony lint:twig (most authoritative).
  const symfonyResult = await trySymfonyLint(filePath);
  if (symfonyResult === null) return null;
  if (typeof symfonyResult === "string") {
    return { lang: "Twig (lint:twig)", message: symfonyResult };
  }

  // 2. twigcs.
  const twigcsResult = await tryTwigcs(filePath);
  if (twigcsResult === null) return null;
  if (typeof twigcsResult === "string") {
    return { lang: "Twig (twigcs)", message: twigcsResult };
  }

  // 3. Regex fallback.
  return checkRegex(filePath);
}

export function formatFailure(failure, filePath) {
  return `[${failure.lang}] ${failure.message.trim()}\n\n请修复后再继续。`;
}
