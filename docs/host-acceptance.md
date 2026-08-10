# Host acceptance (Claude Code + Codex on DeepSeek V4 Flash)

## What this is

Per-plugin suites under `plugins/<name>/acceptance/` that start **real**
non-interactive Claude Code and Codex sessions against a workspace fixture,
with the plugin installed, and assert **post-session world state / host logs**.

This is **not** unit-testing hook scripts via stdin.

Each case installs **only** the plugin under test (not the full marketplace
catalog). If that plugin declares `skill-deps.json`, the harness also installs
those community skills into the isolated case `HOME` so Claude Code / Codex can
load them the same way a user install via `install-all.sh` would.

## Policy: Docker only

**Live host acceptance (Claude / Codex sessions) must run inside the
`docker/host-acceptance` image.** There is no supported host-side path that
invokes `claude` / `codex` for these suites.

| Layer | Where | Command |
| --- | --- | --- |
| Unit tests (`node:test`) | Host | `node --test plugins/*/tests/*.mjs` |
| Expect honesty gate (no API) | Host or container | `./scripts/acceptance/run.sh --honesty-only` |
| Live Claude + Codex suites (per-plugin) | **Docker only** | `./scripts/acceptance/run.sh` (auto-wraps Docker) |
| Project scenarios (full `install-all`) | **Docker only** | `./scripts/acceptance/run-project.sh` |

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
./scripts/acceptance/run.sh --plugin command-safety-guards

# one case / one host (container)
./scripts/acceptance/run.sh \
  --plugin command-safety-guards \
  --case 01-deny-cat-heredoc \
  --host claude

# full marketplace suite (container)
./scripts/acceptance/run.sh

# optional: custom image tag / out dir
ACCEPT_IMAGE=harness-host-acceptance:local \
  ./scripts/acceptance/run.sh --out .acceptance-runs/my-run --plugin file-line-budget-guard
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
- Pins Claude Code + Codex, Node 20, ffmpeg/ffprobe, git, jq, php-cli, composer
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

When a blocking Hook intentionally terminates or holds the host loop,
`case.toml` may declare `allowed_host_exits_<host>` (for example
`allowed_host_exits_codex = [0, 1, 124]`).
The exit code is accepted only after `expect.sh` independently proves the
structured Hook signal and disk outcome. Codex Stop details are read from the
rollout's structured `<hook_prompt>` message rather than inferred from a flat
`hook: Stop Blocked` line.

## Host configuration (inside the image)

- **Claude**: `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`,
  `ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY`, all model aliases → `DEEPSEEK_MODEL`,
  `--plugin-dir`, `--dangerously-skip-permissions`.
- **Codex**: `model_provider=deepseek`, Responses API base `https://api.deepseek.com/`,
  `models.json` from `docker/host-acceptance/models.json`,
  `--dangerously-bypass-hook-trust`, marketplace install of the **single** plugin under test.
- **skill-deps**: before each host session, `run-case.sh` reads
  `plugins/<name>/skill-deps.json` (if present) and installs those community
  skills into the **case-isolated HOME** via `npx skills add … --global`
  (same sources as `install-all.sh`). Results are cached under
  `.acceptance-runs/skill-deps-cache/<plugin>/` keyed by the manifest SHA-256.
  Missing `skill-deps.json` is a no-op; invalid manifests or install failures
  fail the case before the host starts. Emergency opt-out:
  `ACCEPT_SKIP_SKILL_DEPS=1` (not for default live suites).

Offline helper coverage (no API key):

```bash
bash scripts/acceptance/test-skill-deps-install.sh
# optional live npx install smoke:
ACCEPT_TEST_NETWORK=1 bash scripts/acceptance/test-skill-deps-install.sh
```

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

## Project-level acceptance (full install-all)

Per-plugin suites install **one** plugin. Project scenarios under
`acceptance/scenarios/` install the **entire** catalog the way users do:

```bash
scripts/install-all.sh --local <checkout>   # all plugins + skill-deps.json skills
```

into an isolated HOME (cached under the run out dir), then start Claude/Codex
**without** `--plugin-dir` / single-plugin add so every installed hook and
community skill is active.

```bash
# honesty only (no Docker / no API)
./scripts/acceptance/run-project.sh --honesty-only

# logo /goal e2e (Docker; full install-all + open brief)
./scripts/acceptance/run-project.sh \
  --case logo-design/01-goal-e2e-delivery \
  --host claude

# full project suite
./scripts/acceptance/run-project.sh
```

Layout:

```text
acceptance/scenarios/<domain>/cases/<case-id>/
  case.toml  prompt.md  expect.sh  quality-rubric.md  workspace/
```

CLI case id is `<domain>/<case-id>`. Prompts should be realistic `/goal …`
briefs; expects judge final artifacts + quality notes, not a single scripted Write.

| Path | Meaning |
| --- | --- |
| `acceptance/README.md` | Suite overview |
| `scripts/acceptance/run-project.sh` | Runner (Docker-wrap + honesty) |
| `scripts/acceptance/lib/project-common.sh` | install-all cache / seed / host skills |
| `.acceptance-runs/project-latest/` | Default artifacts |

`install-all.sh --local <path>` resolves the plugin catalog and skill-deps from
that checkout (not GitHub master). When `$HOME/.agents/skills` exists, the
Docker wrap mounts it so domain skills (e.g. `logo-design`) seed into case HOME.
