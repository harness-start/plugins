import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const INSTALLER = join(ROOT, "scripts", "install-all.sh");
const MARKETPLACE_ZIP = Buffer.from(
  "UEsDBBQAAAAIAEKuFF1fVW6QRQAAAGIAAAAuAAAAcGx1Z2lucy1tYXN0ZXIvLmNsYXVkZS1wbHVnaW4vbWFya2V0cGxhY2UuanNvbqtWykvMTVWyUspILMpLLS7WLS5JLCpR0lEqyClNz8wrVrKKroYpSa1IzC3ISdWFSAHVFOeXFiWDZPT0ocr10dTUxtYCAFBLAQIUAxQAAAAIAEKuFF1fVW6QRQAAAGIAAAAuAAAAAAAAAAAAAACAAQAAAABwbHVnaW5zLW1hc3Rlci8uY2xhdWRlLXBsdWdpbi9tYXJrZXRwbGFjZS5qc29uUEsFBgAAAAABAAEAXAAAAJEAAAAAAA==",
  "base64",
);
const SECOND_MARKETPLACE_ZIP = Buffer.from(
  "UEsDBBQAAAAIAMuyFF0oE9KnRQAAAGYAAAAuAAAAcGx1Z2lucy1zZWNvbmQvLmNsYXVkZS1wbHVnaW4vbWFya2V0cGxhY2UuanNvbqtWykvMTVWyUlDKSCzKSy0u1i0uSSwqUdJRUCrIKU3PzCsGykVXw1UVpybn56XoQuRAqorzS4uSwVJ6+lAd+qiKamNrAVBLAQIUAxQAAAAIAMuyFF0oE9KnRQAAAGYAAAAuAAAAAAAAAAAAAACAAQAAAABwbHVnaW5zLXNlY29uZC8uY2xhdWRlLXBsdWdpbi9tYXJrZXRwbGFjZS5qc29uUEsFBgAAAAABAAEAXAAAAJEAAAAAAA==",
  "base64",
);

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

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (status, signal) => resolve({ status, signal, stderr }));
  });
}

async function waitForPath(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
    MARKETPLACE_ZIP,
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

test("remote installs stop before plugin sync when ZIP marketplace registration fails", () => {
  for (const host of ["claude", "codex"]) {
    const fixture = mkdtempSync(join(tmpdir(), `installer-${host}-registration-`));
    const bin = join(fixture, "bin");
    const archive = join(fixture, "master.zip");
    const hostLog = join(fixture, `${host}.log`);
    mkdirSync(bin, { recursive: true });
    writeFileSync(archive, MARKETPLACE_ZIP);
    executable(join(bin, "curl"), `#!/bin/sh
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then destination="$2"; shift 2; continue; fi
  shift
done
if [ -n "$destination" ]; then cp ${JSON.stringify(archive)} "$destination"; else printf '%s\n' '{"plugins":[{"name":"example-plugin"}]}'; fi
`);
    executable(join(bin, host), `#!/bin/sh
printf '%s\n' "$*" >> ${JSON.stringify(hostLog)}
case "$*" in plugin\\ marketplace\\ add*) exit 23 ;; esac
printf '%s\n' '[]'
`);

    try {
      const result = runInstaller([`--${host}-only`, "--language", "en-US"], {
        PATH: `${bin}:${process.env.PATH}`,
        CLAUDE_CONFIG_DIR: join(fixture, "claude-home"),
        CODEX_HOME: join(fixture, "codex-home"),
        XDG_CACHE_HOME: join(fixture, "cache"),
      });
      assert.notEqual(result.status, 0, `${host} unexpectedly succeeded: ${result.stderr}`);
      assert.doesNotMatch(readFileSync(hostLog, "utf8"), /plugin (?:uninstall|install|remove|add) example-plugin@/u);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test("failed ZIP registration restores the previous local snapshot for each host", () => {
  for (const host of ["claude", "codex"]) {
    const fixture = mkdtempSync(join(tmpdir(), `installer-${host}-restore-`));
    const bin = join(fixture, "bin");
    const archive = join(fixture, "master.zip");
    const secondArchive = join(fixture, "second.zip");
    const addCount = join(fixture, "add-count");
    const hostLog = join(fixture, `${host}.log`);
    const cacheRoot = join(fixture, "cache");
    mkdirSync(bin, { recursive: true });
    writeFileSync(archive, MARKETPLACE_ZIP);
    writeFileSync(secondArchive, SECOND_MARKETPLACE_ZIP);
    executable(join(bin, "curl"), `#!/bin/sh
args="$*"
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then destination="$2"; shift 2; continue; fi
  shift
done
if [ -n "$destination" ]; then
  case "$args" in *second.zip*) cp ${JSON.stringify(secondArchive)} "$destination" ;; *) cp ${JSON.stringify(archive)} "$destination" ;; esac
else printf '%s\n' '{"plugins":[{"name":"example-plugin"}]}'; fi
`);
    executable(join(bin, host), `#!/bin/sh
printf '%s\n' "$*" >> ${JSON.stringify(hostLog)}
case "$*" in
  plugin\\ marketplace\\ add*)
    count=0; [ ! -f ${JSON.stringify(addCount)} ] || count="$(cat ${JSON.stringify(addCount)})"
    count=$((count + 1)); printf '%s\n' "$count" > ${JSON.stringify(addCount)}
    [ "$count" -ne 2 ] || exit 23
    ;;
esac
printf '%s\n' '[]'
`);
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      CLAUDE_CONFIG_DIR: join(fixture, "claude-home"),
      CODEX_HOME: join(fixture, "codex-home"),
      XDG_CACHE_HOME: cacheRoot,
    };

    try {
      const first = runInstaller([`--${host}-only`, "--language", "en-US"], env);
      assert.equal(first.status, 0, first.stderr);
      const second = runInstaller([`--${host}-only`, "--ref", "second", "--language", "en-US"], env);
      assert.notEqual(second.status, 0, `${host} unexpectedly succeeded: ${second.stderr}`);

      const snapshot = join(cacheRoot, "harness-start", "plugins");
      assert.match(readFileSync(join(snapshot, ".claude-plugin", "marketplace.json"), "utf8"), /example-plugin/u);
      const commands = readFileSync(hostLog, "utf8");
      assert.doesNotMatch(commands, /second-plugin@harness-start/u);
      const addLines = commands.split("\n").filter((line) => line.startsWith("plugin marketplace add "));
      assert.equal(addLines.length, 3);
      assert.ok(addLines.every((line) => line.includes(snapshot)));
      assert.ok(addLines.every((line) => !/plugin marketplace add (?:harness-start\/plugins|https?:\/\/)|--ref/u.test(line)));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test("concurrent remote installs never nest one ZIP snapshot inside another", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "installer-concurrent-zip-"));
  const bin = join(fixture, "bin");
  const archive = join(fixture, "master.zip");
  const secondArchive = join(fixture, "second.zip");
  const cacheRoot = join(fixture, "cache");
  const marketplaceRoot = join(cacheRoot, "harness-start");
  const movedMarker = join(fixture, "old-moved");
  const promotedMarker = join(fixture, "second-promoted");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(marketplaceRoot, "plugins", ".git"), { recursive: true });
  writeFileSync(archive, MARKETPLACE_ZIP);
  writeFileSync(secondArchive, SECOND_MARKETPLACE_ZIP);
  executable(join(bin, "curl"), `#!/bin/sh
args="$*"
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then destination="$2"; shift 2; continue; fi
  shift
done
if [ -n "$destination" ]; then
  case "$args" in *second.zip*) cp ${JSON.stringify(secondArchive)} "$destination" ;; *) cp ${JSON.stringify(archive)} "$destination" ;; esac
else printf '%s\n' '{"plugins":[{"name":"example-plugin"}]}'; fi
`);
  executable(join(bin, "claude"), `#!/bin/sh
case "$*" in
  plugin\\ marketplace\\ add*)
    if [ "\${TEST_INSTALL_ID:-}" = "first" ]; then
      if [ ! -e ${JSON.stringify(join(marketplaceRoot, ".plugins.lock"))} ]; then
        count=0
        while [ ! -e ${JSON.stringify(promotedMarker)} ] && [ "$count" -lt 200 ]; do sleep 0.05; count=$((count + 1)); done
      fi
      grep -q example-plugin ${JSON.stringify(join(marketplaceRoot, "plugins", ".claude-plugin", "marketplace.json"))} || exit 24
    else
      grep -q second-plugin ${JSON.stringify(join(marketplaceRoot, "plugins", ".claude-plugin", "marketplace.json"))} || exit 25
    fi
    ;;
esac
printf '%s\n' '[]'
`);
  executable(join(bin, "mv"), `#!/bin/sh
source_path="$2"
destination="$3"
/bin/mv "$@" || exit $?
if [ "$source_path" = ${JSON.stringify(join(marketplaceRoot, "plugins"))} ]; then
  : > ${JSON.stringify(movedMarker)}
  if [ ! -e ${JSON.stringify(join(marketplaceRoot, ".plugins.lock"))} ]; then
    count=0
    while [ ! -e ${JSON.stringify(promotedMarker)} ] && [ "$count" -lt 200 ]; do sleep 0.05; count=$((count + 1)); done
  fi
elif [ "\${TEST_INSTALL_ID:-}" = "second" ] && [ "$destination" = ${JSON.stringify(join(marketplaceRoot, "plugins"))} ]; then
  : > ${JSON.stringify(promotedMarker)}
fi
`);

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    XDG_CACHE_HOME: cacheRoot,
  };
  try {
    const first = spawn("bash", [INSTALLER, "--claude-only", "--language", "en-US"], {
      cwd: ROOT,
      env: { ...env, CLAUDE_CONFIG_DIR: join(fixture, "claude-first"), TEST_INSTALL_ID: "first" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    await waitForPath(movedMarker);
    const second = spawn("bash", [INSTALLER, "--claude-only", "--ref", "second", "--language", "en-US"], {
      cwd: ROOT,
      env: { ...env, CLAUDE_CONFIG_DIR: join(fixture, "claude-second"), TEST_INSTALL_ID: "second" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    const [firstResult, secondResult] = await Promise.all([waitForExit(first), waitForExit(second)]);
    assert.equal(firstResult.status, 0, `first installer exited via ${firstResult.signal}: ${firstResult.stderr}`);
    assert.equal(secondResult.status, 0, `second installer exited via ${secondResult.signal}: ${secondResult.stderr}`);
    assert.equal(existsSync(join(marketplaceRoot, "plugins", "plugins-master")), false);
    assert.match(readFileSync(join(marketplaceRoot, "plugins", ".claude-plugin", "marketplace.json"), "utf8"), /second-plugin/u);
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
