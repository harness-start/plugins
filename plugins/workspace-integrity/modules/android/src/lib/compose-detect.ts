export type ComposeFinding = {
  code: string;
  line: number;
  message: string;
};

const COLLECT_AS_STATE = /\bcollectAsState\s*\(/u;
const PAGING_NEAR = /\b(?:PagingData|LazyPagingItems|collectAsLazyPagingItems)\b/u;
const BOXED_PRIMITIVE_TYPE = /\bmutableStateOf\s*<\s*(?:Int|Long|Float|Double)\s*>/u;
const BOXED_PRIMITIVE_LITERAL = /\bmutableStateOf\s*\(\s*-?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?[fFlL]?)\s*\)/u;
const FOREGROUND_NAMED = /(?:color|tint)\s*=\s*Color\.(?:Black|White)\b/u;
const FOREGROUND_ARGB = /(?:color|tint)\s*=\s*Color\s*\(\s*0x[0-9A-Fa-f]+/u;
const COLOR_SCHEME = /\b(?:MaterialTheme\.)?colorScheme\b/u;

function maskRange(text: string): string {
  return text.replace(/[^\n]/gu, " ");
}

function maskKotlin(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (source.startsWith('"""', index)) {
      const end = source.indexOf('"""', index + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === "\"" || current === "'") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === current) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out += maskRange(source.slice(index, cursor));
      index = cursor;
      continue;
    }
    out += current ?? "";
    index += 1;
  }
  return out;
}

function nearbyPaging(lines: readonly string[], index: number): boolean {
  const from = Math.max(0, index - 2);
  const to = Math.min(lines.length, index + 3);
  return lines.slice(from, to).some((line) => PAGING_NEAR.test(line));
}

function pushUnique(findings: ComposeFinding[], finding: ComposeFinding): void {
  if (findings.some((item) => item.code === finding.code && item.line === finding.line)) return;
  findings.push(finding);
}

export function detectComposeSource(source: string): ComposeFinding[] {
  if (typeof source !== "string" || source.length === 0) return [];
  const visible = maskKotlin(source);
  const lines = visible.split(/\n/u);
  const findings: ComposeFinding[] = [];
  const hasColorScheme = COLOR_SCHEME.test(visible);
  for (const [index, line] of lines.entries()) {
    if (COLLECT_AS_STATE.test(line)) {
      const paging = nearbyPaging(lines, index);
      pushUnique(findings, paging
        ? {
          code: "PAGING_COLLECT_AS_STATE",
          line: index + 1,
          message: "PagingData must be collected with collectAsLazyPagingItems(), not collectAsState().",
        }
        : {
          code: "COLLECT_AS_STATE",
          line: index + 1,
          message: "UI Flow collection should use collectAsStateWithLifecycle(); if this is PagingData, use collectAsLazyPagingItems() instead.",
        });
    }
    if (BOXED_PRIMITIVE_TYPE.test(line) || BOXED_PRIMITIVE_LITERAL.test(line)) {
      pushUnique(findings, {
        code: "PRIMITIVE_MUTABLE_STATE",
        line: index + 1,
        message: "Use mutableIntStateOf, mutableLongStateOf, mutableFloatStateOf, or mutableDoubleStateOf instead of boxed mutableStateOf.",
      });
    }
    if (hasColorScheme && (FOREGROUND_NAMED.test(line) || FOREGROUND_ARGB.test(line))) {
      pushUnique(findings, {
        code: "HARDCODED_ON_THEME",
        line: index + 1,
        message: "Foreground Color.Black, Color.White, or Color(0x…) over colorScheme is a dark-mode regression; use the matching on* role.",
      });
    }
  }
  return findings;
}
