const LOCKFILE_GROUPS = [
  {
    id: "javascript-lockfiles",
    names: [
      "bun.lock",
      "bun.lockb",
      "deno.lock",
      "npm-shrinkwrap.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ],
    reason: "JavaScript/TypeScript lockfile 由对应包管理器生成",
    recovery: "修改依赖声明后，通过 npm、pnpm、yarn、bun 或 deno 重新生成 lockfile。",
  },
  {
    id: "python-lockfiles",
    names: ["pdm.lock", "Pipfile.lock", "poetry.lock", "uv.lock"],
    reason: "Python lockfile 由对应包管理器生成",
    recovery: "修改依赖声明后，通过 pdm、pipenv、poetry 或 uv 重新生成 lockfile。",
  },
  {
    id: "php-ruby-lockfiles",
    names: ["composer.lock", "Gemfile.lock"],
    reason: "Composer/Bundler lockfile 由包管理器生成",
    recovery: "修改依赖声明后，通过 Composer 或 Bundler 重新生成 lockfile。",
  },
  {
    id: "compiled-language-lockfiles",
    names: [
      "Cargo.lock",
      "go.sum",
      "gradle.lockfile",
      "packages.lock.json",
    ],
    reason: "依赖解析或校验文件由语言工具链生成",
    recovery: "修改依赖声明后，通过 Cargo、Go、Gradle 或 NuGet 工具链重新生成该文件。",
  },
  {
    id: "platform-lockfiles",
    names: [
      ".terraform.lock.hcl",
      "flake.lock",
      "mix.lock",
      "renv.lock",
    ],
    reason: "依赖状态文件由平台工具链生成",
    recovery: "修改依赖声明后，通过 Terraform/OpenTofu、Nix、Mix 或 renv 重新生成该文件。",
  },
  {
    id: "mobile-lockfiles",
    names: ["Package.resolved", "Podfile.lock", "pubspec.lock"],
    reason: "移动端依赖状态文件由对应包管理器生成",
    recovery: "修改依赖声明后，通过 SwiftPM、CocoaPods 或 Dart/Flutter pub 重新生成该文件。",
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function fileNamePattern(names) {
  return new RegExp(
    `(?:^|/)(?:${names.map(escapeRegExp).join("|")})$`,
    "iu",
  );
}

export const BUILTIN_RULES = [
  ...LOCKFILE_GROUPS.map((group) => ({
    id: group.id,
    match: fileNamePattern(group.names),
    mode: "block",
    reason: group.reason,
    recovery: group.recovery,
  })),
  {
    id: "gradle-dependency-lockfiles",
    match: /(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/iu,
    mode: "block",
    reason: "Gradle dependency-locks 目录由 Gradle 维护",
    recovery: "修改 Gradle 依赖声明后，通过 Gradle dependency locking 重新生成。",
  },
  {
    id: "dependency-directories",
    match:
      /(?:^|\/)(?:bower_components|jspm_packages|node_modules|vendor|\.venv|venv|__pypackages__|Pods|\.terraform|\.dart_tool|\.gradle)(?:\/|$)/iu,
    mode: "block",
    reason: "目标位于包管理器拥有的第三方依赖目录",
    recovery: "修改依赖声明、补丁源或项目源码，再通过对应包管理器重新安装依赖。",
  },
  {
    id: "nested-dependency-directories",
    match:
      /(?:^|\/)(?:Carthage\/Build|\.build\/checkouts|\.nuget\/packages|renv\/library|packrat\/lib)(?:\/|$)/iu,
    mode: "block",
    reason: "目标位于包管理器拥有的第三方依赖目录",
    recovery: "修改依赖声明、补丁源或项目源码，再通过对应包管理器重新安装依赖。",
  },
];

function warnDefault(message) {
  process.stderr.write(`[protected-file-guard] ${message}\n`);
}

export function normalizeUserRule(rule, index, warn = warnDefault) {
  if (!rule || !(rule.match instanceof RegExp)) {
    warn(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "allow") {
    warn(`rule[${index}]: "mode" must be "block" or "allow", skipping`);
    return null;
  }
  for (const field of ["id", "reason", "recovery"]) {
    if (rule[field] !== undefined && typeof rule[field] !== "string") {
      warn(`rule[${index}]: "${field}" must be a string, skipping`);
      return null;
    }
  }
  return {
    ...rule,
    id: rule.id?.trim() || `user-rule-${index + 1}`,
    mode,
  };
}

export function resolveRules(userConfig, warn = warnDefault) {
  if (userConfig?.rules !== undefined && !Array.isArray(userConfig.rules)) {
    warn('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES];
  }
  const userRules = (userConfig?.rules ?? [])
    .map((rule, index) => normalizeUserRule(rule, index, warn))
    .filter(Boolean);
  return [...userRules, ...BUILTIN_RULES];
}

function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function matchRule(matchPaths, rules) {
  for (const rule of rules) {
    if (matchPaths.some((path) => regexMatches(rule.match, path))) return rule;
  }
  return null;
}
