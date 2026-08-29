import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";

const SKIPPED = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|\.venv|__generated__|artifacts|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const TEST_DIRECTORY = /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)/iu;
const TEST_ROOTS = new Set(["test", "tests", "spec", "specs"]);
const SOURCE_ROOTS = new Set(["app", "lib", "src"]);
const SUITE_DIRECTORIES = new Set(["acceptance", "feature", "functional", "integration", "unit"]);

export type Language = "typescript" | "javascript" | "python" | "php" | "rust" | "go";
export type PathKind = "ignored" | "test" | "source";

export type ClassifiedPath = {
  kind: PathKind;
  language: Language | null;
};

export type LanguageContext = {
  rustCrateName?: string;
  rustCrateRoot?: string;
  goModulePath?: string;
  goModuleRoot?: string;
  pythonReexports?: Array<{ sourceSymbol: string; publicTarget: string }>;
};

export type TestEvidence = {
  valid: boolean;
  testNames: string[];
  targets: string[];
  references: string[];
  package: string;
};

export type SourceLike = {
  path: string;
  language: string;
  content?: string | null;
};

export type TestRecordLike = {
  path: string;
  language: string;
  evidence?: Partial<TestEvidence> | null;
};

const EXTENSIONS: ReadonlyArray<readonly [Language, RegExp]> = [
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

function normalize(path: string | null | undefined): string {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function isSkippedPath(path: string): boolean {
  return SKIPPED.test(normalize(path));
}

function insideRoot(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/"));
}

function nearestManifest(root: string, path: string, name: string): string | null {
  const workspace = resolve(root);
  let directory = resolve(workspace, dirname(normalize(path)));
  while (insideRoot(workspace, directory)) {
    const candidate = resolve(directory, name);
    if (existsSync(candidate)) return candidate;
    if (directory === workspace) break;
    directory = dirname(directory);
  }
  return null;
}

function relativeDirectory(root: string, path: string): string {
  const value = normalize(relative(resolve(root), dirname(resolve(path))));
  return value === "." ? "" : value;
}

function tomlSection(text: string, name: string): string {
  const header = new RegExp(`^\\[${name}\\]\\s*$`, "mu").exec(text);
  if (!header) return "";
  const remainder = text.slice(header.index + header[0].length);
  const next = /^\s*\[[^\]]+\]\s*$/mu.exec(remainder);
  return next ? remainder.slice(0, next.index) : remainder;
}

export function resolveLanguageContext(root: string, path: string, language: string): LanguageContext {
  if (language === "python") {
    const module = sourceModule(path);
    const separator = module.lastIndexOf(".");
    if (separator < 0) return {};
    const packageName = module.slice(0, separator);
    const initializer = resolve(root, dirname(normalize(path)), "__init__.py");
    if (!insideRoot(root, initializer) || !existsSync(initializer)) return {};
    const reexports: Array<{ sourceSymbol: string; publicTarget: string }> = [];
    const text = withoutComments("python", readFileSync(initializer, "utf8"));
    for (const match of text.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
      const specifier = match[1] ?? "";
      const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
      const imported = dots === 0
        ? specifier
        : [
            ...packageName.split(".").slice(0, Math.max(0, packageName.split(".").length - dots + 1)),
            specifier.slice(dots),
          ].filter(Boolean).join(".");
      if (imported !== module) continue;
      for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
        const binding = item.trim().match(/^(\*|[A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
        if (binding?.[1]) {
          reexports.push({
            sourceSymbol: binding[1],
            publicTarget: `python:${packageName}#${binding[2] ?? binding[1]}`,
          });
        }
      }
    }
    return { pythonReexports: reexports };
  }
  if (language === "rust") {
    const manifest = nearestManifest(root, path, "Cargo.toml");
    if (!manifest) return {};
    const text = readFileSync(manifest, "utf8");
    const libraryName = tomlSection(text, "lib").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const packageName = tomlSection(text, "package").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const name = libraryName ?? packageName;
    if (!name) return {};
    return { rustCrateName: name.replaceAll("-", "_"), rustCrateRoot: relativeDirectory(root, manifest) };
  }
  if (language === "go") {
    const manifest = nearestManifest(root, path, "go.mod");
    if (!manifest) return {};
    const modulePath = readFileSync(manifest, "utf8").match(/^\s*module\s+(\S+)/mu)?.[1];
    if (!modulePath) return {};
    return { goModulePath: modulePath, goModuleRoot: relativeDirectory(root, manifest) };
  }
  return {};
}

function languageFor(path: string): Language | null {
  for (const [language, pattern] of EXTENSIONS) if (pattern.test(path)) return language;
  return null;
}

function isTestPath(path: string, language: Language): boolean {
  const name = posix.basename(path);
  if (language === "php") return TEST_DIRECTORY.test(path) || /Test\.php$/u.test(name);
  if (language === "python") return TEST_DIRECTORY.test(path) || /^test_.+\.py$/u.test(name) || /_test\.py$/u.test(name);
  if (["javascript", "typescript"].includes(language)) {
    return TEST_DIRECTORY.test(path) || /\.(?:test|spec)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu.test(name);
  }
  if (language === "rust") return TEST_DIRECTORY.test(path);
  if (language === "go") return /_test\.go$/u.test(name);
  return false;
}

export function classifyPath(path: string): ClassifiedPath {
  const value = normalize(path);
  if (!value || SKIPPED.test(value) || /(?:^|\/)\.test-driven-development\.mjs$/u.test(value)) {
    return { kind: "ignored", language: null };
  }
  const language = languageFor(value);
  if (!language) return { kind: "ignored", language: null };
  return { kind: isTestPath(value, language) ? "test" : "source", language };
}

function matches(text: string, pattern: RegExp, group = 1): string[] {
  const found: string[] = [];
  for (const match of String(text ?? "").matchAll(pattern)) {
    const value = match[group];
    if (value) found.push(value);
  }
  return found;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function identifiers(text: string): string[] {
  return unique(matches(text, /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/gu)
    .filter((value) => !RESERVED.has(value.toLowerCase())));
}

function withoutComments(language: string, text: unknown): string {
  let value = String(text ?? "");
  if (["php", "javascript", "typescript", "rust", "go"].includes(language)) {
    value = value.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  }
  if (language === "python") return value.replace(/#.*$/gmu, "");
  if (language === "php") return value.replace(/#(?!\[).*$/gmu, "");
  return value;
}

function testNames(language: string, text: string): string[] {
  if (language === "php") {
    return [
      ...matches(text, /\bfunction\s+(test[A-Za-z0-9_]*)\s*\(/gu),
      ...matches(text, /#\s*\[\s*Test\s*\][\s\S]{0,160}?\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu),
      ...matches(text, /\b(?:it|test)\s*\(\s*["']([^"']+)["']/gu),
    ];
  }
  if (language === "python") return matches(text, /^\s*def\s+(test_[A-Za-z0-9_]*)\s*\(/gmu);
  if (["javascript", "typescript"].includes(language)) {
    return matches(text, /\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/gu);
  }
  if (language === "rust") return matches(text, /#\s*\[\s*test\s*\][\s\S]{0,160}?\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu);
  if (language === "go") return matches(text, /\bfunc\s+(Test[A-Za-z0-9_]*)\s*\(/gu);
  return [];
}

function identifierUsed(text: string, identifier: string | null | undefined): boolean {
  if (!identifier) return false;
  return new RegExp(`\\b${identifier.replace(/[$]/gu, "\\$")}\\b`, "u").test(text);
}

function phpNamespace(code: string): string {
  return code.match(/\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*[;{]/u)?.[1]?.replace(/^\\/u, "") ?? "";
}

function phpImports(code: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const match of code.matchAll(/^\s*use\s+(?!function\b|const\b)([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*;/gmu)) {
    const qualified = (match[1] ?? "").replace(/^\\/u, "");
    imports.set(match[2] ?? qualified.split("\\").at(-1) ?? "", qualified);
  }
  return imports;
}

function resolvePhpName(name: string, namespace: string, imports: Map<string, string>): string {
  const value = String(name ?? "").trim();
  if (!value) return "";
  if (value.startsWith("\\")) return value.slice(1);
  const [head, ...tail] = value.split("\\");
  if (head !== undefined && imports.has(head)) return [imports.get(head), ...tail].join("\\");
  return namespace ? `${namespace}\\${value}` : value;
}

function phpCoverageTargets(raw: string, code: string): string[] {
  const namespace = phpNamespace(code);
  const imports = phpImports(code);
  const targets: string[] = [];
  for (const reference of matches(code, /\bCoversClass\s*\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)\s*::class\s*\)/gu)) {
    targets.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  for (const reference of matches(raw, /@covers\s+([\\A-Za-z_][\\A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)?/gu)) {
    targets.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  return unique(targets);
}

function pythonImportModule(specifier: string, testPath: string): string {
  const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
  if (dots === 0) return specifier;
  const packageSegments = stripExtension(testPath).split("/");
  packageSegments.pop();
  const keep = packageSegments.length - dots + 1;
  if (keep < 0) return "";
  return [
    ...packageSegments.slice(0, keep),
    specifier.slice(dots),
  ].filter(Boolean).join(".");
}

function pythonTargets(code: string, testPath: string): string[] {
  const body = code.replace(/^\s*(?:from\s+[^\n]+\s+import\s+[^\n]+|import\s+[^\n]+)$/gmu, "");
  const targets: string[] = [];
  for (const match of code.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
    const importedModule = pythonImportModule(match[1] ?? "", testPath);
    if (!importedModule) continue;
    for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
      const binding = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
      if (binding && identifierUsed(body, binding[2] ?? binding[1])) {
        targets.push(`python:${importedModule}#${binding[1]}`);
        if (/^[a-z_][a-z0-9_]*$/u.test(binding[1] ?? "")) {
          const namespaceModule = `${importedModule}.${binding[1]}`;
          targets.push(`python-module:${namespaceModule}`);
          const local = binding[2] ?? binding[1] ?? "";
          for (const member of matches(body, new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
            targets.push(`python:${namespaceModule}#${member}`);
          }
        }
      }
    }
  }
  for (const match of code.matchAll(/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/gmu)) {
    const local = match[2] ?? match[1]?.split(".")[0];
    if (identifierUsed(body, local)) targets.push(`python-module:${match[1]}`);
  }
  return unique(targets);
}

function stripExtension(path: string | null | undefined): string {
  return normalize(path).replace(/\.(?:cjs|cts|js|jsx|mjs|mts|php|py|pyi|rs|ts|tsx|go)$/iu, "");
}

function javascriptTargets(code: string, testPath: string): string[] {
  const body = code
    .replace(/\bimport\s+[\s\S]*?\s+from\s+["'][^"']+["']\s*;?/gu, "")
    .replace(/\b(?:const|let|var)\s+[^=]+?=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/gu, "");
  const targets: string[] = [];
  const addModule = (specifier: string, bindings: string[]) => {
    if (!specifier.startsWith(".")) return;
    if (!bindings.some((binding) => identifierUsed(body, binding))) return;
    const resolved = stripExtension(posix.normalize(posix.join(posix.dirname(normalize(testPath)), specifier)));
    targets.push(`javascript-module:${resolved}`);
  };
  for (const match of code.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu)) {
    const clause = (match[1] ?? "").replace(/^type\s+/u, "").trim();
    const bindings: string[] = [];
    const namespace = clause.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/u);
    if (namespace?.[1]) bindings.push(namespace[1]);
    const named = clause.match(/\{([\s\S]*?)\}/u)?.[1] ?? "";
    for (const item of named.split(",")) {
      const binding = item.trim().replace(/^type\s+/u, "").match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/u);
      if (binding) bindings.push(binding[2] ?? binding[1] ?? "");
    }
    const defaultBinding = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/u)?.[1];
    if (defaultBinding) bindings.push(defaultBinding);
    addModule(match[2] ?? "", bindings);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const bindings = identifiers(match[1] ?? "");
    addModule(match[2] ?? "", bindings);
  }
  const sourceReaders = new Set(["readFileSync"]);
  for (const match of code.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:[^,)]*)?[^)]*\)\s*(?::[^{]+)?\{([\s\S]{0,1200}?)\n?\}/gu)) {
    const helper = match[1] ?? "";
    const parameter = match[2] ?? "";
    const helperBody = match[3] ?? "";
    const escapedParameter = parameter.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const readsParameter = new RegExp(`\\breadFileSync\\s*\\([^;\\n]{0,500}\\b${escapedParameter}\\b[^;\\n]{0,500}\\)`, "u").test(helperBody);
    if (readsParameter) sourceReaders.add(helper);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const binding = match[1] ?? "";
    const reader = match[2] ?? "";
    const sourcePath = normalize(match[3] ?? "");
    const remainder = code.slice((match.index ?? 0) + match[0].length);
    if (!sourceReaders.has(reader) || !identifierUsed(remainder, binding) || !/^(?:app|lib|src)\//u.test(sourcePath)) continue;
    targets.push(`javascript-module:${stripExtension(sourcePath)}`);
  }
  return unique(targets);
}

function rustTargets(code: string, context: LanguageContext): string[] {
  const body = code.replace(/^\s*use\s+[^;]+;\s*$/gmu, "");
  const crateName = String(context.rustCrateName ?? "");
  const crateRoot = normalize(context.rustCrateRoot ?? "");
  if (!crateName) return [];
  const targets: string[] = [];
  for (const match of code.matchAll(/^\s*use\s+([^;]+)\s*;/gmu)) {
    const expression = (match[1] ?? "").trim();
    const grouped = expression.match(/^(.+?)::\{(.+)\}$/u);
    const paths = grouped
      ? (grouped[2] ?? "").split(",").map((item) => `${grouped[1]}::${item.trim()}`)
      : [expression];
    for (const path of paths) {
      const alias = path.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1];
      const segments = path.replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_]*$/u, "").split("::");
      const item = segments.pop();
      if (!identifierUsed(body, alias ?? item)) continue;
      const importedCrate = segments.shift()?.replaceAll("-", "_");
      if (importedCrate !== crateName.replaceAll("-", "_")) continue;
      targets.push(`rust:${crateRoot}:${crateName}#${segments.join("::")}#${item}`);
    }
  }
  return unique(targets);
}

function goPackage(code: string): string {
  return code.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)/mu)?.[1] ?? "";
}

function goTargets(code: string): string[] {
  const body = code.replace(/^\s*import\s+(?:\([^)]*\)|[^\n]+)$/gmu, "");
  const targets: string[] = [];
  for (const match of code.matchAll(/^\s*(?:import\s+)?(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?"([^"]+)"\s*$/gmu)) {
    const local = match[1] ?? match[2]?.split("/").at(-1);
    for (const used of body.matchAll(new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
      targets.push(`go-import:${match[2]}#${used[1]}`);
    }
  }
  return unique(targets);
}

export function extractTestEvidence(language: string, text: unknown, testPath = "", context: LanguageContext = {}): TestEvidence {
  const raw = String(text ?? "");
  const code = withoutComments(language, raw);
  const names = unique(testNames(language, code));
  let targets: string[] = [];
  if (language === "php") targets = phpCoverageTargets(raw, code);
  else if (language === "python") targets = pythonTargets(code, testPath);
  else if (["javascript", "typescript"].includes(language)) targets = javascriptTargets(code, testPath);
  else if (language === "rust") targets = rustTargets(code, context);
  else if (language === "go") targets = goTargets(code);
  return {
    valid: names.length > 0,
    testNames: names,
    targets,
    references: identifiers(code),
    package: language === "go" ? goPackage(code) : "",
  };
}

function sourceModule(path: string): string {
  const segments = stripExtension(path).split("/");
  const sourceIndex = segments.reduce((found, segment, index) => ["lib", "src"].includes(segment.toLowerCase()) ? index : found, -1);
  const moduleSegments = sourceIndex >= 0 ? segments.slice(sourceIndex + 1) : segments;
  if (moduleSegments.at(-1) === "__init__") moduleSegments.pop();
  return moduleSegments.join(".");
}

function javascriptModule(path: string): string {
  return stripExtension(path);
}

function rustModule(path: string): { scope: string; module: string } | null {
  const segments = stripExtension(path).split("/");
  const index = segments.lastIndexOf("src");
  if (index < 0) return null;
  const scope = segments.slice(0, index).join("/");
  const modules = segments.slice(index + 1);
  const last = modules.at(-1);
  if (last !== undefined && ["lib", "main", "mod"].includes(last)) modules.pop();
  return { scope, module: modules.join("::") };
}

export function extractSourceSymbols(language: string, text: unknown): string[] {
  const value = withoutComments(language, text);
  if (language === "php") {
    const namespace = phpNamespace(value);
    return unique(matches(value, /\b(?:class|interface|trait|enum|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu)
      .map((symbol) => namespace ? `${namespace}\\${symbol}` : symbol));
  }
  if (language === "python") return unique(matches(value, /^\s*(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gmu));
  if (["javascript", "typescript"].includes(language)) {
    return unique(matches(value, /\b(?:export\s+)?(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu));
  }
  if (language === "rust") return unique(matches(value, /\b(?:pub\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gu));
  if (language === "go") return unique(matches(value, /\b(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/gu));
  return [];
}

function goImportPath(sourcePath: string, context: LanguageContext): string {
  const modulePath = String(context.goModulePath ?? "").replace(/\/$/u, "");
  if (!modulePath) return "";
  const moduleRoot = normalize(context.goModuleRoot ?? "");
  const directory = posix.dirname(normalize(sourcePath));
  const relativePackage = moduleRoot ? posix.relative(moduleRoot, directory) : directory;
  if (relativePackage.startsWith("..")) return "";
  return relativePackage === "." || relativePackage === "" ? modulePath : `${modulePath}/${relativePackage}`;
}

function explicitSourceTargets(source: SourceLike, context: LanguageContext): string[] {
  const symbols = extractSourceSymbols(source.language, source.content);
  if (source.language === "php") return symbols.map((symbol) => `php:${symbol}`);
  if (source.language === "python") {
    const module = sourceModule(source.path);
    const reexports = context.pythonReexports ?? [];
    return [
      `python-module:${module}`,
      ...symbols.map((symbol) => `python:${module}#${symbol}`),
      ...reexports.flatMap(({ sourceSymbol, publicTarget }) => {
        if (sourceSymbol === "*" && publicTarget.endsWith("#*")) {
          const prefix = publicTarget.slice(0, -1);
          return symbols.map((symbol) => `${prefix}${symbol}`);
        }
        return symbols.includes(sourceSymbol) ? [publicTarget] : [];
      }),
    ];
  }
  if (["javascript", "typescript"].includes(source.language)) {
    const module = javascriptModule(source.path);
    return [`javascript-module:${module}`, `javascript-module:${module.replace(/\/index$/u, "")}`];
  }
  if (source.language === "rust") {
    const descriptor = rustModule(source.path);
    const crateName = String(context.rustCrateName ?? "");
    const crateRoot = normalize(context.rustCrateRoot ?? "");
    if (!descriptor || !crateName || descriptor.scope !== crateRoot) return [];
    return symbols.map((symbol) => `rust:${crateRoot}:${crateName}#${descriptor.module}#${symbol}`);
  }
  if (source.language === "go") {
    const importPath = goImportPath(source.path, context);
    return importPath ? symbols.map((symbol) => `go-import:${importPath}#${symbol}`) : [];
  }
  return [];
}

function removeTestSuffix(name: string | null | undefined, language: string): string {
  let value = stripExtension(name);
  if (language === "php") value = value.replace(/Test$/u, "");
  else if (language === "python") value = value.replace(/^test_/u, "").replace(/_test$/u, "");
  else if (["javascript", "typescript"].includes(language)) value = value.replace(/\.(?:test|spec)$/u, "");
  else if (language === "go") value = value.replace(/_test$/u, "");
  return value;
}

function rootDescriptor(path: string, roots: Set<string>): { scope: string; rest: string[] } | null {
  const segments = normalize(path).split("/");
  const index = segments.findIndex((segment) => roots.has(segment.toLowerCase()));
  if (index < 0) return null;
  return { scope: segments.slice(0, index).join("/"), rest: segments.slice(index + 1) };
}

function mirrorIdentity(path: string, language: string, kind: "source" | "test"): string | null {
  if (["javascript", "typescript"].includes(language) && kind === "test") {
    const segments = normalize(path).split("/").filter((segment) => segment !== "__tests__");
    const name = removeTestSuffix(segments.pop(), language);
    if (/\.(?:test|spec)$/u.test(stripExtension(posix.basename(path)))) {
      const colocated = rootDescriptor([...segments, name].join("/"), SOURCE_ROOTS);
      if (colocated) return `${colocated.scope}#${colocated.rest.join("/")}`;
    }
  }
  if (language === "go") {
    const directory = posix.dirname(normalize(path));
    return `${directory}/${kind === "test" ? removeTestSuffix(posix.basename(path), language) : stripExtension(posix.basename(path))}`;
  }
  const descriptor = rootDescriptor(path, kind === "test" ? TEST_ROOTS : SOURCE_ROOTS);
  if (!descriptor) {
    if (kind !== "source") return null;
    const normalized = normalize(path);
    return `${posix.dirname(normalized)}#${removeTestSuffix(posix.basename(normalized), language)}`;
  }
  const rest = [...descriptor.rest];
  if (kind === "test") {
    while (rest.length > 1 && SUITE_DIRECTORIES.has(rest[0]?.toLowerCase() ?? "")) rest.shift();
  }
  const name = kind === "test" ? removeTestSuffix(rest.pop(), language) : stripExtension(rest.pop());
  return `${descriptor.scope}#${[...rest, name].join("/")}`;
}

function mirrorMatches(source: SourceLike, testRecord: TestRecordLike): boolean {
  const sourceIdentity = mirrorIdentity(source.path, source.language, "source");
  const testIdentity = mirrorIdentity(testRecord.path, source.language, "test");
  return Boolean(sourceIdentity && testIdentity && sourceIdentity === testIdentity);
}

function pythonPackageReexportMatches(source: SourceLike, testRecord: TestRecordLike): boolean {
  if (source.language !== "python" || !mirrorMatches(source, testRecord)) return false;
  const module = sourceModule(source.path);
  const separator = module.lastIndexOf(".");
  if (separator < 0) return false;
  const packageName = module.slice(0, separator);
  const targets = new Set(testRecord.evidence?.targets ?? []);
  return extractSourceSymbols("python", source.content)
    .some((symbol) => targets.has(`python:${packageName}#${symbol}`));
}

function goPackageMatches(source: SourceLike, testRecord: TestRecordLike): boolean {
  if (source.language !== "go") return false;
  const sourceDirectory = posix.dirname(normalize(source.path));
  const testDirectory = posix.dirname(normalize(testRecord.path));
  const sourcePackage = goPackage(withoutComments("go", source.content));
  const testPackage = String(testRecord.evidence?.package ?? "").replace(/_test$/u, "");
  const symbols = new Set(extractSourceSymbols("go", source.content));
  const references = testRecord.evidence?.references ?? [];
  if (sourceDirectory === testDirectory && sourcePackage && sourcePackage === testPackage && references.some((value) => symbols.has(value))) return true;
  return false;
}

export function sourceAuthorizedByTest(source: SourceLike | null | undefined, testRecord: TestRecordLike | null | undefined, context: LanguageContext = {}): boolean {
  if (!source || !testRecord || source.language !== testRecord.language || !testRecord.evidence?.valid) return false;
  const testTargets = new Set(testRecord.evidence.targets ?? []);
  if (explicitSourceTargets(source, context).some((target) => testTargets.has(target))) return true;
  if (pythonPackageReexportMatches(source, testRecord)) return true;
  if (testTargets.size > 0) return false;
  if (goPackageMatches(source, testRecord)) return true;
  return mirrorMatches(source, testRecord);
}

function pascal(value: string): string {
  return String(value).split(/[-_]/u).filter(Boolean).map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1)).join("");
}

function languageTestFileName(stem: string, language: string): string {
  if (language === "php") return `${pascal(stem)}Test.php`;
  if (language === "python") return `test_${stem}.py`;
  if (language === "javascript") return `${stem}.test.js`;
  if (language === "typescript") return `${stem}.test.ts`;
  if (language === "rust") return `${stem}.rs`;
  if (language === "go") return `${stem}_test.go`;
  return stem;
}

function suiteExampleName(language: string): string {
  return ["python", "javascript", "typescript"].includes(language) ? "unit" : "Unit";
}

export function expectedMirrorTestPaths(sourcePath: string, language: string): string[] {
  const normalized = normalize(sourcePath);
  if (language === "go") {
    const directory = posix.dirname(normalized);
    const fileName = languageTestFileName(stripExtension(posix.basename(normalized)), language);
    return [directory === "." ? fileName : `${directory}/${fileName}`];
  }
  const descriptor = rootDescriptor(normalized, SOURCE_ROOTS);
  const rest = descriptor ? [...descriptor.rest] : normalized.split("/").filter(Boolean);
  const stem = stripExtension(rest.pop() ?? "");
  const relativeDir = rest.join("/");
  const scopePrefix = descriptor?.scope ? `${descriptor.scope}/` : "";
  const fileName = languageTestFileName(stem, language);
  const withDir = relativeDir ? `${relativeDir}/` : "";
  const paths = [
    `${scopePrefix}tests/${withDir}${fileName}`,
    `${scopePrefix}tests/${suiteExampleName(language)}/${withDir}${fileName}`,
  ];
  if (["javascript", "typescript"].includes(language)) {
    const sourceDir = posix.dirname(normalized);
    paths.push(sourceDir === "." ? fileName : `${sourceDir}/${fileName}`);
  }
  return paths;
}

export function expectedTestExample(sourcePath: string, language: string): string {
  const listed = expectedMirrorTestPaths(sourcePath, language).join(" or ");
  if (!listed) return "a matching test file";
  if (language === "php") return `${listed} or a test with #[CoversClass(Target::class)]`;
  if (language === "python") return `${listed} or a test importing the exact module`;
  if (language === "javascript" || language === "typescript") return `${listed} or a test with an exact relative import`;
  if (language === "rust") return `${listed} or a test using the exact crate module item`;
  if (language === "go") return `${listed} in the same package referencing a declared symbol`;
  return listed;
}
