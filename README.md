# harness-start

Marketplace id: `harness-start` · Display name: **Harness Start**

Harness Start dual-platform plugin marketplace for **Claude Code** and **Codex**.

**Public install source:** [https://github.com/harness-start/plugins](https://github.com/harness-start/plugins)

Both hosts share plugin business scripts. Marketplace indexes, plugin manifests, and hook configs are maintained separately because field names, environment variables, and lifecycle events differ across platforms.

## Install (one command)

Adds/updates the marketplace and installs/updates **all** plugins for Claude Code and Codex (whichever CLIs are on `PATH`):

```bash
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
```

Common variants:

```bash
# Only Claude Code
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --claude-only

# Only Codex
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --codex-only

# Skip missing host CLIs instead of failing
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --skip-missing-hosts

# From a local clone
bash scripts/install-all.sh
bash scripts/install-all.sh --dry-run
```

Requirements: `bash`, network to GitHub, and **Claude Code CLI** and/or **Codex CLI**. `jq` is recommended.

After install:

- **Claude Code:** start a new session (or `/reload-plugins` if prompted) so hooks load.
- **Codex:** review and **trust** plugin hooks via `/hooks`. Install success does not mean hooks are trusted or running.

### Manual install (equivalent)

```bash
# Claude Code
claude plugin marketplace add harness-start/plugins
# if already added:
claude plugin marketplace update harness-start
claude plugin install <name>@harness-start   # repeat per plugin, or use install-all.sh

# Codex
codex plugin marketplace add harness-start/plugins --ref master
# if already added:
codex plugin marketplace upgrade harness-start
codex plugin add <name>@harness-start --json
```

## Repository layout

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── plugins/                           # Self-contained plugins live here
├── scripts/install-all.sh             # One-click marketplace + all plugins
├── scripts/ci/validate-plugins.sh     # Shared GitHub/GitLab CI checks
├── .github/workflows/validate-plugins.yml
├── .gitlab-ci.yml
└── GUIDE.md                           # Full init / release guide
```

Default branch: `master`

Each plugin is self-contained. Do not reference files outside its own directory at runtime; Claude Code copies a single plugin directory into cache.

`GUIDE.md` uses example plugin names such as `session-hooks` and `policy-checks` for illustration only. Real plugins are registered under `plugins/` and listed in both marketplace indexes.

## Plugins

| Plugin | Description |
| --- | --- |
| `execution-loop-guard` | Detects repeated edits, blind command retries, and excessive remote polling before agents waste a session |
| `source-sanity-guard` | Blocks backup artifacts, obvious replacement-character corruption, and unresolved merge markers in source files |
| `code-quality-guard` | Runs bounded JS/TS, Python, and PHP syntax, lint, and static-analysis checks after file edits |
| `encoding-guard` | Blocks BOM-bearing and invalid UTF-8 text files after AI writes |
| `file-line-budget-guard` | Ratchet-enforced per-language file line budgets on Edit/Write |
| `protected-file-guard` | Blocks direct file-tool edits to dependency lockfiles and package-manager-owned dependency directories |
| `command-safety-guards` | Denies broad recursive deletion, unbacked `sed` in-place edits, and non-temporary `cat` heredoc writes |
| `process-confidence` | Observable delivery process: validated `begin`, hook receipts, auto complete, Stop gate |
| `in-chinese` | Keeps main-agent and subagent prose in Simplified Chinese and blocks long Korean, Japanese, or Thai language drift |
| `subagent-discipline` | Injects scope/evidence contract + return hygiene; with `agent_id`, ledger cleanup (24h), gitignore ensure, optional Stop gate |

## Prerequisites

- Git
- Node.js 20+
- Claude Code CLI and/or Codex CLI (for install / host checks)
- `jq` (recommended)

## Local static checks

GitHub Actions and GitLab CI both run the same script:

```bash
bash scripts/ci/validate-plugins.sh
```

That script validates JSON, all plugin JavaScript syntax, dual-platform manifest versions, offline unit tests, dual-host acceptance case structure, inert-log honesty, Claude/Codex marketplace loading, and **requires every `plugins/*` directory to be registered in both marketplace indexes** (and rejects orphan marketplace entries).

Hosts already installed:

```bash
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```

## Local marketplace (development)

```bash
# Claude Code
claude plugin marketplace add "$(pwd)"
claude plugin install <plugin-name>@harness-start

# Codex
codex plugin marketplace add . --json
codex plugin list --marketplace harness-start --available --json
codex plugin add <plugin-name>@harness-start --json
```

## Adding a plugin

See `GUIDE.md` section 16. Register the plugin in both:

- `.claude-plugin/marketplace.json`
- `.agents/plugins/marketplace.json`

## Docs

- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)

## Host acceptance (Claude Code + Codex on DeepSeek)

**Live acceptance is Docker-only** (`docker/host-acceptance`). From the host,
`./scripts/acceptance/run.sh` always builds/runs that image for smoke and live
cases (Claude + Codex). Unit tests and the honesty gate may still run on the
host. Requires `.env` with `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL=deepseek-v4-flash`:

```bash
./scripts/acceptance/run.sh --smoke                         # DeepSeek smoke (Docker)
./scripts/acceptance/run.sh                                 # all plugins × claude+codex (Docker)
./scripts/acceptance/run.sh --plugin command-safety-guards  # one plugin (Docker)
./scripts/acceptance/run.sh --honesty-only                  # inert expect gate only (no Docker)
```

See [docs/host-acceptance.md](docs/host-acceptance.md).
