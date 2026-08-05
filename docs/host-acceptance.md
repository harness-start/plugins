# Host acceptance (Claude Code + Codex on DeepSeek V4 Flash)

## What this is

Per-plugin suites under `plugins/<name>/acceptance/` that start **real**
non-interactive Claude Code and Codex sessions against a workspace fixture,
with the plugin installed, and assert **post-session world state / host logs**.

This is **not** unit-testing hook scripts via stdin.

## Prerequisites

- Node 20+, `claude`, `codex` (or Docker)
- Repo `.env`:

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
```

Only `deepseek-v4-flash` is supported for dual-host acceptance.

## Run locally (hosts on PATH)

```bash
# smoke both hosts against DeepSeek
./scripts/acceptance/run.sh --smoke

# one plugin
./scripts/acceptance/run.sh --plugin php-runtime-guards

# one case / one host
./scripts/acceptance/run.sh --plugin php-runtime-guards --case 01-deny-repositories --host claude

# everything
./scripts/acceptance/run.sh
```

Artifacts land in `.acceptance-runs/latest/` (gitignored): per-case workspace
copies, `host.log`, `status.txt`, plus `summary.txt` and `acceptance-all.log`.

## Run via Docker

```bash
./scripts/acceptance/run.sh --docker
./scripts/acceptance/run.sh --docker --plugin php-runtime-guards
```

Image: `docker/host-acceptance/Dockerfile` (Claude + Codex + node + php + jq).

## Case layout

```text
plugins/<name>/acceptance/cases/<id>/
  case.toml      # hosts, timeout_sec
  workspace/     # initial cwd
  prompt.md      # agent task
  expect.sh      # exit 0 = pass; uses ACCEPT_* env vars
```

Environment for `expect.sh`:

| Variable | Meaning |
| --- | --- |
| `ACCEPT_WORKSPACE` | Writable workspace copy after the session |
| `ACCEPT_LOG` | Host stdout+stderr |
| `ACCEPT_HOST` | `claude` or `codex` |
| `ACCEPT_PLUGIN` | Plugin name |
| `HOME` / `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` | Isolated per case |

## Host configuration

- **Claude**: `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`,
  `ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY`, all model aliases → `DEEPSEEK_MODEL`,
  `--plugin-dir`, `--dangerously-skip-permissions`.
- **Codex**: `model_provider=deepseek`, Responses API base `https://api.deepseek.com/`,
  `models.json` from `docker/host-acceptance/models.json`,
  `--dangerously-bypass-hook-trust`, marketplace install of the plugin.

## Adding a case

1. Add `cases/<id>/` with workspace + prompt + expect.
2. Prefer hard evidence (file present/absent, grep of guard strings in log).
3. Keep prompts short and single-purpose so the agent attempts the inducing tool call.

## Expect honesty gate

Before live host sessions, `./scripts/acceptance/run.sh` runs:

```bash
./scripts/acceptance/check-expect-honesty.sh
```

Each case’s `expect.sh` is fed an inert `host.log` that contains the full
`prompt.md`, the case workdir path, and a model refuse line — but **no** real
hook markers. Every expect must exit non-zero.

Shared helpers: `scripts/acceptance/lib/expect-helpers.sh`
(`require_guard_hook_signal` with product markers only — never path fragments).
