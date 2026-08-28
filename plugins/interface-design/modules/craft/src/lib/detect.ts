import { extname } from "node:path";

export type CraftFinding = {
  code: string;
  path: string;
  line: number;
  message: string;
};

export const UI_EXTENSIONS = new Set([
  ".css", ".scss", ".html", ".htm", ".tsx", ".jsx", ".vue", ".svelte", ".astro",
]);

const IGNORED_SEGMENTS = new Set(["node_modules", "dist", ".git", "vendor-skills", "coverage"]);
const IGNORED_BASENAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock"]);

function maskBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/gu, (comment) => comment.replace(/[^\r\n]/gu, " "));
}

const RULES: Array<{ code: string; message: string; pattern: RegExp }> = [
  {
    code: "HARD_OFFSET_SHADOW",
    message: "hard offset shadow with zero blur is a costume unless the world is neobrutalist",
    pattern: /box-shadow\s*:\s*-?\d+(?:px)?\s+-?\d+(?:px)?\s+0(?:px)?(?:\s|$|,)/iu,
  },
  {
    code: "GRADIENT_TEXT",
    message: "gradient or clipped text is decoration; use weight or size for emphasis",
    pattern: /(?:-webkit-)?background-clip\s*:\s*text/iu,
  },
  {
    code: "EYEBROW_KICKER",
    message: "eyebrow/kicker labels above a heading are banned; let the heading speak",
    pattern: /\b(?:class|className)\s*=\s*(["'`])[^"'`]*\b(?:eyebrow|kicker)\b/iu,
  },
  {
    code: "SECTION_NUMBER_DECORATION",
    message: "decorative section numbers are banned unless the sequence itself is information",
    pattern: /<(?:h[1-3]|Heading)\b[^>]*>\s*0[1-9]\b/iu,
  },
  {
    code: "REPEATING_GRID_BACKGROUND",
    message: "repeating-linear-gradient grids need a real canvas, map, or measuring tool",
    pattern: /background(?:-image)?\s*:\s*repeating-linear-gradient/iu,
  },
  {
    code: "TRANSITION_ALL",
    message: "transition-all is present; enumerate the properties that are intended to animate",
    pattern: /(?:\btransition(?:-property)?\s*:\s*all(?:\s|;|$)|\btransition-all\b)/iu,
  },
  {
    code: "FOCUS_OUTLINE_REMOVED",
    message: "a native focus outline is removed; verify an equally visible focus-visible replacement",
    pattern: /(?:\boutline\s*:\s*(?:none|0(?:px)?)(?:\s|;|$)|\boutline-none\b)/iu,
  },
];

export function isUiPath(filePath: string): boolean {
  return UI_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true;
  const base = parts.at(-1) ?? "";
  return IGNORED_BASENAMES.has(base);
}

export function detectUiSource(filePath: string, source: string): CraftFinding[] {
  if (!isUiPath(filePath) || isIgnoredPath(filePath)) return [];
  if (typeof source !== "string") return [];
  const findings: CraftFinding[] = [];
  const lines = maskBlockComments(source).split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ code: rule.code, path: filePath, line: index + 1, message: rule.message });
      }
    }
  }
  return findings;
}

export function findingKey(finding: CraftFinding): string {
  return `${finding.path}:${finding.code}:${finding.line}`;
}
