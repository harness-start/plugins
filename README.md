# harness-start

Marketplace id: `harness-start` · Display name: **Harness Start**

Harness Start dual-platform plugin marketplace for **Claude Code** and **Codex**.

> [!WARNING]
> This repository is under active development. Implementations and behavior may change at any time.

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

# Select the default response language (Simplified Chinese remains the default)
curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash -s -- --language en-US

# From a local clone
bash scripts/install-all.sh
bash scripts/install-all.sh --dry-run

# Skip community skill-deps (offline / no npx)
bash scripts/install-all.sh --skip-skill-deps
```

Requirements: `bash`, network to GitHub, and **Claude Code CLI** and/or **Codex CLI**. `jq` is recommended. Community skill deps also need **Node.js / `npx`** (see below).

After install:

- **Claude Code:** start a new session (or `/reload-plugins` if prompted) so hooks load.
- **Codex:** review and **trust** plugin hooks via `/hooks`. Install success does not mean hooks are trusted or running.
- **Community skills:** plugins may declare `skill-deps.json`; `install-all.sh` installs/updates them into the **global** skills scope (`npx skills add … --global`).

`--language <profile>` accepts `zh-CN`, `en-US`, `ja-JP`, `ko-KR`, or `th-TH`. When provided, the installer stores the selected profile in each installed host's own configuration directory. Without the option, `language-output-governance` keeps its built-in `zh-CN` default. A project's `.language-output-governance.mjs` overrides the installed user preference.

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
| `research-provenance-guard` | Orchestrated hard research (`research-evidence-workflow`): project workflow files, MCP capture/anchors, typed claims, seal, post-seal handoff |
| `verification-provenance-guard` | Requires machine-checkable provenance for test, artifact, Git, and CI conclusions in completion responses |
| `execution-loop-guard` | Detects repeated edits, blind command retries, and excessive remote polling before agents waste a session |
| `source-sanity-guard` | Blocks backup artifacts and obvious replacement-character corruption in source files |
| `git-delivery-guards` | Guards local Git commands, atomic commits, repository state, and unresolved merge markers |
| `code-quality-guard` | Runs bounded JS/TS, Python, and PHP syntax, lint, and static-analysis checks after file edits |
| `encoding-guard` | Blocks BOM-bearing and invalid UTF-8 text files after AI writes |
| `markdown-format-guard` | Checks Markdown heading structure and common formatting rules after AI writes |
| `file-line-budget-guard` | Ratchet-enforced per-language file line budgets on Edit/Write |
| `protected-file-guard` | Blocks direct file-tool edits to dependency lockfiles and package-manager-owned dependency directories |
| `command-safety-guards` | Denies broad recursive deletion, unbacked `sed` in-place edits, and non-temporary `cat` heredoc writes |
| `language-output-governance` | Keeps main-agent and subagent prose aligned with one configurable session language; Simplified Chinese is the default profile |
| `subagent-workflow-guard` | Provides scoped handoff applications, one-time receipts on hook-capable dispatch seams, and sealed review/closure validation |
| `subagent-lifecycle-audit` | Records append-only subagent starts/stops and lifecycle gaps without storing work content |
| `intent-clarify-gate` | Gates business writes during grill-me style intent clarification until `done` or complete-option close |
| `first-principles-gate` | Gates business writes during first-principles analysis until a structured on-disk ledger is complete and the session closes |
| `goal-task-gate` | Arms on host `/goal` prompts, forces append-only decision trails under `.goal-task/`, and completes only with `GOAL_TASK_DONE` trailer plus close row |
| `file-access-audit` | Records structured agent file reads/writes to project-local `.file-access-audit/sessions/<session>.jsonl` |
| `command-exec-audit` | Records agent shell commands with status and duration to project-local `.command-exec-audit/sessions/<session>.jsonl` |

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

## Community skill dependencies

Some plugins need public Agent Skills (for example `intent-clarify-gate` → `grill-me`). Declare them per plugin:

```text
plugins/<name>/skill-deps.json
```

```json
{
  "skills": [
    {
      "name": "grill-me",
      "source": "https://github.com/mattpocock/skills",
      "description": "optional note"
    }
  ]
}
```

`scripts/install-all.sh` collects every catalog plugin's `skill-deps.json` (local clone or GitHub raw for the curl one-liner), dedupes by skill name, and runs:

```bash
npx --yes skills add <source> --skill <name> --global --yes -a claude-code -a codex
```

Flags / env:

| Flag / env | Effect |
| --- | --- |
| `--skip-skill-deps` | Do not install skill-deps |
| `HARNESS_SKIP_SKILL_DEPS=1` | Same as above |
| `--list-only` | Also prints resolved `name<TAB>source` pairs |

Omit `skill-deps.json` when the plugin has no community skill needs. The file is optional; CI validates schema when present.

## Adding a plugin

See `GUIDE.md` section 16. Register the plugin in both:

- `.claude-plugin/marketplace.json`
- `.agents/plugins/marketplace.json`

If the plugin needs a public skill (skills.sh / GitHub skill repo), add `plugins/<name>/skill-deps.json` so `install-all.sh` can install it globally.

## Docs

- [Artifact Delivery Evidence 插件拆分](docs/artifact-delivery-evidence-plugins.md)
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
