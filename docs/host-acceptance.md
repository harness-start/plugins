# Host acceptance (Claude Code + Codex on DeepSeek V4 Flash)

## What this is

Per-plugin suites under `plugins/<name>/acceptance/` that start **real**
non-interactive Claude Code and Codex sessions against a workspace fixture,
with the plugin installed, and assert **post-session world state / host logs**.

This is **not** unit-testing hook scripts via stdin.

## Policy: Docker only

**Live host acceptance (Claude / Codex sessions) must run inside the
`docker/host-acceptance` image.** There is no supported host-side path that
invokes `claude` / `codex` for these suites.

| Layer | Where | Command |
| --- | --- | --- |
| Unit tests (`node:test`) | Host | `node --test plugins/*/tests/*.mjs` |
| Expect honesty gate (no API) | Host or container | `./scripts/acceptance/run.sh --honesty-only` |
| Live Claude + Codex suites | **Docker only** | `./scripts/acceptance/run.sh` (auto-wraps Docker) |

On the host, `./scripts/acceptance/run.sh` always builds/runs the acceptance
image for smoke and live cases. Inside the container, the same script runs the
cases directly (entrypoint sets `ACCEPT_IN_CONTAINER=1`).

## Prerequisites

- Docker
- Repo `.env` (not committed):

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
```

Only `deepseek-v4-flash` is supported for dual-host acceptance.

## Run (always via Docker for live)

From the repo root:

```bash
# smoke both hosts against DeepSeek (container)
./scripts/acceptance/run.sh --smoke

# one plugin (container)
./scripts/acceptance/run.sh --plugin php-runtime-guards

# one case / one host (container)
./scripts/acceptance/run.sh \
  --plugin php-runtime-guards \
  --case 01-deny-repositories \
  --host claude

# full marketplace suite (container)
./scripts/acceptance/run.sh

# optional: custom image tag / out dir
ACCEPT_IMAGE=harness-host-acceptance:local \
  ./scripts/acceptance/run.sh --out .acceptance-runs/my-run --plugin typescript-runtime-guards
```

`--docker` is accepted for clarity but is **redundant** on the host: live runs
always use the container. Nested `--docker` inside the image is rejected.

Honesty only (no Docker required; no API):

```bash
./scripts/acceptance/run.sh --honesty-only
# or
./scripts/acceptance/check-expect-honesty.sh
```

## Artifacts

Default out dir: `.acceptance-runs/latest/` (gitignored), bind-mounted into the
container as `/out`:

| Path | Meaning |
| --- | --- |
| `summary.txt` | `PASS/FAIL plugin/case/host` lines |
| `acceptance-all.log` | Combined log |
| `<plugin>__<case>__<host>/host.log` | Host session log |
| `.../status.txt` | `RESULT=PASS` etc. |
| `.../workspace/` | Post-session workspace copy |

## Image

- Dockerfile: `docker/host-acceptance/Dockerfile`
- Pins Claude Code + Codex, Node 20, git, jq, php-cli, composer
- Entrypoint: `docker/host-acceptance/entrypoint.sh` → `scripts/acceptance/run.sh`
- Models: `docker/host-acceptance/models.json` (Codex DeepSeek provider)
- **Non-root only**: Claude rejects `--dangerously-skip-permissions` when running
  as root. `run.sh` always launches the container with
  `--user "$(id -u):$(id -g)"` and `HOME=/out/.container-home`.
- **Root leftovers**: older root-container runs may leave root-owned files under
  `.acceptance-runs/`. Smoke purges those via a one-shot root container
  (`--entrypoint` bypass) before the non-root suite starts; no host `sudo`
  required (docker group is enough).

Build is invoked automatically by `run.sh` when launching from the host:

```bash
docker build -t harness-host-acceptance:local \
  -f docker/host-acceptance/Dockerfile \
  docker/host-acceptance
```


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

## Host configuration (inside the image)

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
4. Verify with `./scripts/acceptance/run.sh --plugin <name> --case <id>` (Docker).

## Expect honesty gate

Before live host sessions, `./scripts/acceptance/run.sh` runs on the **host**
(no API):

```bash
./scripts/acceptance/check-expect-honesty.sh
```

Each case’s `expect.sh` is fed an inert `host.log` that contains the full
`prompt.md`, the case workdir path, and a model refuse line — but **no** real
hook markers. Every expect must exit non-zero.

Shared helpers: `scripts/acceptance/lib/expect-helpers.sh`
(`require_guard_hook_signal` with product markers only — never path fragments).
