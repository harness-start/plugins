import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const INSTALLER = join(ROOT, "scripts", "install-all.sh");

function executable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function runInstaller(args, env = {}) {
  return spawnSync("bash", [INSTALLER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("installer rejects unsupported language profiles", () => {
  const result = runInstaller(["--language", "fr-FR", "--list-only"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--language must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH/u);
});

test("installer fails closed when no marketplace catalog can be resolved", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-fallback-"));
  const bin = join(fixture, "bin");
  const scripts = join(fixture, "scripts");
  const detachedInstaller = join(scripts, "install-all.sh");
  mkdirSync(bin, { recursive: true });
  mkdirSync(scripts, { recursive: true });
  executable(detachedInstaller, readFileSync(INSTALLER, "utf8"));
  for (const command of ["curl", "wget", "claude", "codex"]) {
    executable(join(bin, command), "#!/bin/sh\nexit 1\n");
  }

  try {
    const result = spawnSync("bash", [detachedInstaller, "--list-only", "--skip-skill-deps"], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Unable to resolve plugin catalog/u);
    assert.doesNotMatch(result.stderr, /embedded fallback/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer writes host-scoped language preferences", () => {
  const fixture = mkdtempSync(join(tmpdir(), "language-installer-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  const codexRoot = join(fixture, "codex");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "claude"), "#!/bin/sh\nprintf '[]\\n'\n");
  executable(join(bin, "codex"), "#!/bin/sh\nprintf '[]\\n'\n");

  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    CLAUDE_CONFIG_DIR: claudeRoot,
    CODEX_HOME: codexRoot,
    LC_ALL: "zh_TW.UTF-8",
    LC_MESSAGES: "",
    LANG: "zh_TW.UTF-8",
  };

  try {
    const claude = runInstaller(
      ["--claude-only", "--skip-skill-deps", "--language", "en-US"],
      env,
    );
    assert.equal(claude.status, 0, claude.stderr);
    const claudePath = join(claudeRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(claudePath, "utf8")), { defaultProfile: "en-US" });

    const codex = runInstaller(
      ["--codex-only", "--skip-skill-deps", "--language", "ja-JP"],
      env,
    );
    assert.equal(codex.status, 0, codex.stderr);
    const codexPath = join(codexRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(codexPath, "utf8")), { defaultProfile: "ja-JP" });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer prefers macOS AppleLanguages over an English POSIX locale", () => {
  const fixture = mkdtempSync(join(tmpdir(), "language-installer-macos-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "claude"), "#!/bin/sh\nprintf '[]\\n'\n");
  executable(join(bin, "uname"), "#!/bin/sh\nprintf 'Darwin\\n'\n");
  executable(join(bin, "defaults"), `#!/bin/sh
if [ "\$1" = "read" ] && [ "\$2" = "-g" ] && [ "\$3" = "AppleLanguages" ]; then
  cat <<'EOF'
(
    "zh-Hans-CN",
    "en-US"
)
EOF
  exit 0
fi
exit 1
`);

  try {
    const result = runInstaller(["--claude-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CONFIG_DIR: claudeRoot,
      LC_ALL: "en_US.UTF-8",
      LC_MESSAGES: "en_US.UTF-8",
      LANG: "en_US.UTF-8",
    });
    assert.equal(result.status, 0, result.stderr);
    const path = join(claudeRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { defaultProfile: "zh-CN" });
    assert.match(result.stderr, /AppleLanguages zh-Hans-CN mapped to zh-CN/u);
    assert.doesNotMatch(result.stderr, /system locale en_US\.UTF-8 mapped to en-US/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer uses a supported system locale when language is omitted", () => {
  const fixture = mkdtempSync(join(tmpdir(), "language-installer-system-locale-"));
  const bin = join(fixture, "bin");
  const codexRoot = join(fixture, "codex");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "codex"), "#!/bin/sh\nprintf '[]\\n'\n");

  try {
    const result = runInstaller(["--codex-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_HOME: codexRoot,
      LC_ALL: "zh_TW.UTF-8",
      LC_MESSAGES: "",
      LANG: "en_US.UTF-8",
    });
    assert.equal(result.status, 0, result.stderr);
    const path = join(codexRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { defaultProfile: "zh-TW" });
    assert.match(result.stderr, /system locale zh_TW\.UTF-8 mapped to zh-TW/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer falls back to English when the system locale is unsupported", () => {
  const fixture = mkdtempSync(join(tmpdir(), "language-installer-locale-fallback-"));
  const bin = join(fixture, "bin");
  const claudeRoot = join(fixture, "claude");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "claude"), "#!/bin/sh\nprintf '[]\\n'\n");

  try {
    const result = runInstaller(["--claude-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CONFIG_DIR: claudeRoot,
      LC_ALL: "fr_FR.UTF-8",
      LC_MESSAGES: "",
      LANG: "fr_FR.UTF-8",
    });
    assert.equal(result.status, 0, result.stderr);
    const path = join(claudeRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { defaultProfile: "en-US" });
    assert.match(result.stderr, /unsupported system locale fr_FR\.UTF-8; using en-US/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function writeCodexStub(bin, logFile, listJson) {
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "codex"), `#!/bin/sh
printf '%s\\n' "$*" >> "${logFile}"
case " $* " in
  *" marketplace list "*)
    cat <<'JSON'
${listJson}
JSON
    ;;
  *" marketplace upgrade "*)
    printf '%s\\n' "Error: marketplace \\\`harness-start\\\` is not configured as a Git marketplace" >&2
    exit 1
    ;;
  *)
    printf '%s\\n' "[]"
    ;;
esac
`);
}

test("installer re-adds a local Codex marketplace instead of aborting on upgrade", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-codex-local-mp-"));
  const bin = join(fixture, "bin");
  const logFile = join(fixture, "codex.log");
  mkdirSync(bin, { recursive: true });
  writeCodexStub(bin, logFile, JSON.stringify({
    marketplaces: [{
      name: "harness-start",
      root: "/tmp/old-harness-start",
      marketplaceSource: { sourceType: "local", source: "/tmp/old-harness-start" },
    }],
  }, null, 2));

  try {
    const result = runInstaller(["--codex-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_HOME: join(fixture, "codex"),
    });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(logFile, "utf8");
    assert.match(result.stderr, /not a Git marketplace|replacing|adding marketplace/u);
    assert.doesNotMatch(log, /marketplace upgrade harness-start/u);
    assert.match(log, /marketplace add /u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer upgrades a Git Codex marketplace", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-codex-git-mp-"));
  const bin = join(fixture, "bin");
  const logFile = join(fixture, "codex.log");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "codex"), `#!/bin/sh
printf '%s\\n' "$*" >> "${logFile}"
case " $* " in
  *" marketplace list "*)
    cat <<'JSON'
{
  "marketplaces": [
    {
      "name": "harness-start",
      "marketplaceSource": { "sourceType": "git", "source": "https://github.com/harness-start/plugins.git" }
    }
  ]
}
JSON
    ;;
  *" marketplace upgrade "*)
    printf '%s\\n' '{"upgraded":true}'
    ;;
  *)
    printf '%s\\n' "[]"
    ;;
esac
`);

  try {
    const result = runInstaller(["--codex-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_HOME: join(fixture, "codex"),
    });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(logFile, "utf8");
    assert.match(result.stderr, /upgrading marketplace harness-start/u);
    assert.match(log, /marketplace upgrade harness-start/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("installer replaces a Git Codex marketplace when upgrade fails", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-codex-git-mp-upgrade-failure-"));
  const bin = join(fixture, "bin");
  const logFile = join(fixture, "codex.log");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), "#!/bin/sh\nexit 1\n");
  executable(join(bin, "codex"), `#!/bin/sh
printf '%s\\n' "$*" >> "${logFile}"
case " $* " in
  *" marketplace list "*)
    cat <<'JSON'
{
  "marketplaces": [
    {
      "name": "harness-start",
      "marketplaceSource": { "sourceType": "git", "source": "https://github.com/harness-start/plugins.git" }
    }
  ]
}
JSON
    ;;
  *" marketplace upgrade "*)
    printf '%s\\n' 'fatal: early EOF' >&2
    exit 1
    ;;
  *)
    printf '%s\\n' "[]"
    ;;
esac
`);

  try {
    const result = runInstaller(["--codex-only", "--skip-skill-deps"], {
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_HOME: join(fixture, "codex"),
    });
    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(logFile, "utf8");
    assert.match(
      commands,
      /marketplace upgrade harness-start --json[\s\S]*marketplace remove harness-start --json[\s\S]*marketplace add harness-start\/plugins --ref master --json/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
