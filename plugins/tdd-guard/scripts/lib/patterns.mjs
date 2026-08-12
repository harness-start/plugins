import { basename } from "node:path";

const SKIPPED = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|\.venv|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const TEST_DIRECTORY = /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)/iu;

const EXTENSIONS = [
  ["typescript", /\.(?:cts|mts|ts|tsx)$/iu],
  ["javascript", /\.(?:cjs|js|jsx|mjs)$/iu],
  ["python", /\.(?:py|pyi)$/iu],
  ["php", /\.php$/iu],
  ["rust", /\.rs$/iu],
  ["go", /\.go$/iu],
];

const RESERVED = new Set([
  "assert", "class", "const", "def", "describe", "extends", "false", "final", "from",
  "function", "import", "interface", "namespace", "new", "null", "package", "public",
  "require", "return", "self", "static", "struct", "test", "this", "trait", "true",
  "type", "use", "void",
]);

function normalize(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

function languageFor(path) {
  for (const [language, pattern] of EXTENSIONS) if (pattern.test(path)) return language;
  return null;
}

function isTestPath(path, language) {
  const name = basename(path);
  if (language === "php") return TEST_DIRECTORY.test(path) || /Test\.php$/u.test(name);
  if (language === "python") return TEST_DIRECTORY.test(path) || /^test_.+\.py$/u.test(name) || /_test\.py$/u.test(name);
  if (["javascript", "typescript"].includes(language)) {
    return TEST_DIRECTORY.test(path) || /\.(?:test|spec)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu.test(name);
  }
  if (language === "rust") return TEST_DIRECTORY.test(path);
  if (language === "go") return /_test\.go$/u.test(name);
  return false;
}

export function classifyPath(path) {
  const value = normalize(path);
  if (!value || SKIPPED.test(value) || /(?:^|\/)\.tdd-guard\.mjs$/u.test(value)) {
    return { kind: "ignored", language: null };
  }
  const language = languageFor(value);
  if (!language) return { kind: "ignored", language: null };
  return { kind: isTestPath(value, language) ? "test" : "source", language };
}

function matches(text, pattern, group = 1) {
  const found = [];
  for (const match of String(text ?? "").matchAll(pattern)) {
    const value = match[group];
    if (value) found.push(value);
  }
  return found;
}

function identifiers(text) {
  return matches(text, /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/gu)
    .filter((value) => !RESERVED.has(value.toLowerCase()));
}

function withoutComments(language, text) {
  let value = String(text ?? "");
  if (["php", "javascript", "typescript", "rust", "go"].includes(language)) {
    value = value.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  }
  if (language === "python") return value.replace(/#.*$/gmu, "");
  if (language === "php") return value.replace(/#(?!\[).*$/gmu, "");
  return value;
}

function testNames(language, text) {
  if (language === "php") {
    return [
      ...matches(text, /\bfunction\s+(test[A-Za-z0-9_]*)\s*\(/gu),
      ...matches(text, /#\s*\[\s*Test\s*\][\s\S]{0,160}?\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu),
      ...matches(text, /\b(?:it|test)\s*\(\s*["']([^"']+)["']/gu),
    ];
  }
  if (language === "python") {
    return matches(text, /^\s*def\s+(test_[A-Za-z0-9_]*)\s*\(/gmu);
  }
  if (["javascript", "typescript"].includes(language)) {
    return matches(text, /\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/gu);
  }
  if (language === "rust") return matches(text, /#\s*\[\s*test\s*\][\s\S]{0,160}?\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu);
  if (language === "go") return matches(text, /\bfunc\s+(Test[A-Za-z0-9_]*)\s*\(/gu);
  return [];
}

export function extractTestEvidence(language, text) {
  const code = withoutComments(language, text);
  const names = [...new Set(testNames(language, code))];
  const references = [...new Set(identifiers(code))];
  return { valid: names.length > 0, testNames: names, references };
}

function stripExtension(name) {
  return name.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|php|py|pyi|rs|ts|tsx|go)$/iu, "");
}

function sourceStem(path) {
  return stripExtension(basename(normalize(path)));
}

function testStem(path, language) {
  let value = stripExtension(basename(normalize(path)));
  if (language === "php") value = value.replace(/Test$/u, "");
  else if (language === "python") value = value.replace(/^test_/u, "").replace(/_test$/u, "");
  else if (["javascript", "typescript"].includes(language)) value = value.replace(/\.(?:test|spec)$/u, "");
  else if (language === "go") value = value.replace(/_test$/u, "");
  return value;
}

function comparable(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

export function extractSourceSymbols(language, text) {
  const value = String(text ?? "");
  if (language === "php") return [...new Set(matches(value, /\b(?:class|interface|trait|enum|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu))];
  if (language === "python") return [...new Set(matches(value, /^\s*(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gmu))];
  if (["javascript", "typescript"].includes(language)) {
    return [...new Set(matches(value, /\b(?:export\s+)?(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu))];
  }
  if (language === "rust") return [...new Set(matches(value, /\b(?:pub\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gu))];
  if (language === "go") return [...new Set(matches(value, /\b(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/gu))];
  return [];
}

export function sourceAuthorizedByTest(source, testRecord) {
  if (!source || !testRecord || source.language !== testRecord.language || !testRecord.evidence?.valid) return false;
  if (comparable(sourceStem(source.path)) === comparable(testStem(testRecord.path, source.language))) return true;
  const references = new Set(testRecord.evidence.references ?? []);
  const symbols = extractSourceSymbols(source.language, source.content);
  if (symbols.some((symbol) => references.has(symbol))) return true;
  const stem = sourceStem(source.path);
  return references.has(stem) || references.has(stem.replace(/[-_](.)/gu, (_, character) => character.toUpperCase()));
}

function pascal(value) {
  return String(value).split(/[-_]/u).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
}

export function expectedTestExample(sourcePath, language) {
  const stem = sourceStem(sourcePath);
  if (language === "php") return `tests/**/${pascal(stem)}Test.php`;
  if (language === "python") return `tests/test_${stem}.py`;
  if (language === "javascript") return `tests/${stem}.test.js`;
  if (language === "typescript") return `tests/${stem}.test.ts`;
  if (language === "rust") return `tests/${stem}.rs`;
  if (language === "go") return `${stem}_test.go`;
  return "a matching test file";
}
