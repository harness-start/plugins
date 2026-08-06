# harness-start

Marketplace id: `harness-start` · Display name: **Harness Start**

Harness Start dual-platform plugin marketplace for **Claude Code** and **Codex**.

Both hosts share plugin business scripts. Marketplace indexes, plugin manifests, and hook configs are maintained separately because field names, environment variables, and lifecycle events differ across platforms.

## Repository layout

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── plugins/                           # Self-contained plugins live here
├── scripts/ci/validate-plugins.sh     # Shared GitHub/GitLab CI checks
├── .github/workflows/validate-plugins.yml
├── .gitlab-ci.yml
└── GUIDE.md                           # Full init / release guide
```

Default branch: `master`  
GitLab: `https://git.gzcrm.cn/harness-start/plugins`

Each plugin is self-contained. Do not reference files outside its own directory at runtime; Claude Code copies a single plugin directory into cache.

`GUIDE.md` uses example plugin names such as `session-hooks` and `policy-checks` for illustration only. Real plugins are registered under `plugins/` and listed in both marketplace indexes.

## Plugins

| Plugin | Description |
| --- | --- |
| `file-line-budget-guard` | Ratchet-enforced per-language file line budgets on Edit/Write |
| `command-safety-guards` | Denies broad recursive deletion, unbacked `sed` in-place edits, and non-temporary `cat` heredoc writes |
| `process-confidence` | Observable delivery process: validated `begin`, hook receipts, auto complete, Stop gate |

## Prerequisites

- Git
- Node.js 20+
- Claude Code CLI
- Codex CLI
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

## Claude Code

```bash
claude plugin validate --strict .
claude plugin marketplace add "$(pwd)"
# claude plugin install <plugin-name>@harness-start
```

## Codex

```bash
codex plugin marketplace add . --json
codex plugin list --marketplace harness-start --available --json
# codex plugin add <plugin-name>@harness-start --json
```

Codex does not auto-trust plugin hooks. Review and trust hook definitions before they run. Install success alone does not prove hooks executed; start a new session and verify.

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
