import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const result = spawnSync("bash", [detachedInstaller, "--list-only", ], {
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

test("remote installs use a persistent master ZIP snapshot instead of a Git marketplace", () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-remote-zip-"));
  const bin = join(fixture, "bin");
  const archive = join(fixture, "master.zip");
  const curlLog = join(fixture, "curl.log");
  const claudeLog = join(fixture, "claude.log");
  const codexLog = join(fixture, "codex.log");
  const cacheRoot = join(fixture, "cache");
  const marketplace = {
    name: "harness-start",
    plugins: [{ name: "example-plugin", source: "./plugins/example-plugin" }],
  };
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(cacheRoot, "harness-start", "plugins", ".git"), { recursive: true });
  writeFileSync(
    archive,
    Buffer.from(
      "UEsDBBQAAAAIAEKuFF1fVW6QRQAAAGIAAAAuAAAAcGx1Z2lucy1tYXN0ZXIvLmNsYXVkZS1wbHVnaW4vbWFya2V0cGxhY2UuanNvbqtWykvMTVWyUspILMpLLS7WLS5JLCpR0lEqyClNz8wrVrKKroYpSa1IzC3ISdWFSAHVFOeXFiWDZPT0ocr10dTUxtYCAFBLAQIUAxQAAAAIAEKuFF1fVW6QRQAAAGIAAAAuAAAAAAAAAAAAAACAAQAAAABwbHVnaW5zLW1hc3Rlci8uY2xhdWRlLXBsdWdpbi9tYXJrZXRwbGFjZS5qc29uUEsFBgAAAAABAAEAXAAAAJEAAAAAAA==",
      "base64",
    ),
  );
  executable(join(bin, "curl"), `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(curlLog)}
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    destination="$2"
    shift 2
    continue
  fi
  shift
done
if [ -n "$destination" ]; then
  cp ${JSON.stringify(archive)} "$destination"
else
  printf '%s\\n' ${JSON.stringify(JSON.stringify(marketplace))}
fi
`);
  executable(join(bin, "claude"), `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(claudeLog)}
printf '%s\\n' '[]'
`);
  executable(join(bin, "codex"), `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(codexLog)}
printf '%s\\n' '[]'
`);

  try {
    const result = runInstaller(["--language", "en-US"], {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CONFIG_DIR: join(fixture, "claude"),
      CODEX_HOME: join(fixture, "codex-home"),
      XDG_CACHE_HOME: cacheRoot,
    });
    assert.equal(result.status, 0, result.stderr);

    const snapshot = join(cacheRoot, "harness-start", "plugins");
    assert.deepEqual(
      JSON.parse(readFileSync(join(snapshot, ".claude-plugin", "marketplace.json"), "utf8")),
      marketplace,
    );
    assert.equal(existsSync(join(snapshot, ".git")), false);
    assert.match(
      readFileSync(curlLog, "utf8"),
      /https:\/\/github\.com\/harness-start\/plugins\/archive\/master\.zip/u,
    );
    for (const logFile of [claudeLog, codexLog]) {
      const commands = readFileSync(logFile, "utf8");
      assert.match(commands, /plugin marketplace remove harness-start/u);
      assert.match(commands, new RegExp(`plugin marketplace add ${snapshot}`, "u"));
      assert.doesNotMatch(commands, /plugin marketplace add (?:harness-start\/plugins|https?:\/\/)/u);
    }
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
      ["--local", ROOT, "--claude-only", "--language", "en-US"],
      env,
    );
    assert.equal(claude.status, 0, claude.stderr);
    const claudePath = join(claudeRoot, "harness-start", "language-output.json");
    assert.deepEqual(JSON.parse(readFileSync(claudePath, "utf8")), { defaultProfile: "en-US" });

    const codex = runInstaller(
      ["--local", ROOT, "--codex-only", "--language", "ja-JP"],
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
    const result = runInstaller(["--local", ROOT, "--claude-only"], {
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
  executable(join(bin, "uname"), "#!/bin/sh\nprintf 'Linux\\n'\n");

  try {
    const result = runInstaller(["--local", ROOT, "--codex-only"], {
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
  executable(join(bin, "uname"), "#!/bin/sh\nprintf 'Linux\\n'\n");

  try {
    const result = runInstaller(["--local", ROOT, "--claude-only"], {
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
