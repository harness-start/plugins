# Harness Start SWE-bench runner

This directory contains the versioned, reproducible SWE-bench runner for the
Harness Start marketplace. It installs the same clean marketplace snapshot into
Claude Code and Codex, lets each host make one attempt, and delegates the final
decision to the official SWE-bench evaluator.

Stage 1 passes only when all six cells below are officially `resolved`:

| Instance | Claude Code | Codex |
| --- | --- | --- |
| `astropy__astropy-12907` | required | required |
| `django__django-10914` | required | required |
| `django__django-11001` | required | required |

Stage 2 is the independent follow-up suite in
[`config/stage2.yaml`](config/stage2.yaml). It passes only when all four cells
for `astropy__astropy-7746` and `django__django-11019` are officially
`resolved` on Claude Code and Codex. It uses the explicit generic Python
bug-fix plugin profile declared in that suite instead of mounting unrelated
mobile, artifact-production, infrastructure, and reporting hooks.

The frozen suite is [`config/stage1.yaml`](config/stage1.yaml). It pins
SWE-bench Lite and its dataset revision, SWE-bench `4.1.0`, Claude Code
`2.1.170`, Codex `0.147.0`, `deepseek-v4-flash`, high reasoning effort, one
attempt per cell, and one official evaluator worker.

## Isolation model

- Every live agent runs in a Docker image layered on the official per-instance
  SWE-bench evaluator image. The official `testbed` Conda environment is
  activated before the host starts.
- The benchmark mounts a materialized consumer snapshot, not the development
  checkout. Source, tests, caches, `.env`, and symbolic links are excluded.
  `harness.mode: full` includes the complete catalog; `profile` includes only
  the suite-declared plugin set and rewrites both host catalogs to that exact
  set. The selected set and its bytes are bound into the payload fingerprint.
- Before building the agent cells, the harness rejects selected plugin runtime
  payloads that contain an instance/repository identity or a copied 12-word
  span from any configured problem statement. Conceptually task-shaped plugin
  guidance is forbidden by review even when paraphrased: benchmark findings
  must first be reduced to a task-independent mechanism and synthetic outcome
  test.
- The agent network is Docker-internal. Its only external route is an HTTPS
  CONNECT proxy whose exact allowlist is `api.deepseek.com:443`.
- The checkout exposed to the agent is reinitialized as one sealed Git commit.
  Web tools are disabled and no benchmark patch or gold answer is placed in the
  prompt or marketplace payload.
- The generated patch is evaluated later in the official clean evaluator image;
  the augmented agent image is never used to judge correctness.

## Prerequisites

- Linux with a working Docker daemon
- Node.js and npm compatible with the root project
- `uv`
- `DEEPSEEK_API_KEY` in the process environment or the repository root `.env`
- enough disk for SWE-bench instance and evaluator images

The API key is passed to each container by environment-variable name. It is not
written to the run metadata or materialized marketplace snapshot.

## Commands

From the repository root:

```bash
npm run bench:swe:check
npm run bench:swe:gold -- --run-id stage1-gold
npm run bench:swe:stage1 -- --run-id stage1-001
benchmarks/swe-bench/run.sh --suite benchmarks/swe-bench/config/stage2.yaml run --run-id stage2-001
```

`check` verifies the pinned toolchain, plugin catalogs and committed `dist/`,
downloads the pinned dataset snapshot, builds support images, and proves the
network policy. It never rebuilds plugin distribution files.

`gold-smoke` asks the official evaluator to grade one built-in gold patch. Run it
before spending model calls; it verifies the local Docker/evaluator pipeline.

`stage1` runs the fixed 3 × 2 matrix and exits zero only for an exact 6/6. A run
ID is immutable by default. If an agent cell does not complete its host/install/
patch chain, the run stops before official evaluation and must be replaced with
a new run ID. To reuse completed cells after an interruption that happened
between cells:

```bash
npm run bench:swe:stage1 -- --run-id stage1-001 --resume
```

Resume reuses only cells with a complete `status.json`. If the interruption
happened during an agent call, the runner rejects that incomplete cell and
requires a new run ID so a hidden second attempt can never be reported as the
first. It also rejects a saved marketplace whose selected plugin list or
payload fingerprint differs from the current checkout, preventing old cells
from being relabeled with new source metadata.

`run` applies the same exact-cell gate to whichever suite is supplied with
`--suite`; its denominator is derived from that suite's configured instances
and hosts. A profile is a consumer-side plugin selection, not a weakened
plugin build: every selected plugin remains self-contained with its original
Skills, Hooks, scripts, and acceptance contract.

## Artifacts

Local artifacts live under `benchmarks/swe-bench/runs/<run-id>/` and are ignored
by Git. Important files are:

- `run.json`: source, dataset, toolchain, model, plugin list, and payload digest
- `network-check.log`: positive DeepSeek and negative non-allowlisted probes
- `marketplace/`: the exact clean payload mounted into agents
- `instances/<instance>/<host>/`: prompt, host/debug/proxy logs, patch, installed
  plugin manifest, environment evidence, and per-cell status
- `predictions/<host>.jsonl`: official SWE-bench prediction input
- `evaluation/<host>/official-report.json`: copied official evaluator report
- `report.json` and `report.md`: exact stage gate summary

`pipeline_ok` means the host/install/patch/evaluator chain completed with model
endpoint evidence. It is deliberately insufficient for success: `resolved` must
also come from the official SWE-bench report for every required cell.

## Extending the benchmark

Add a separate versioned suite file for another SWE-bench slice or phase. Keep
dataset revision, instance IDs, toolchain, hosts, model, attempt policy, network
allowlist, and grader settings in that suite. Do not add issue-specific hints,
patches, or target answers to prompts, plugins, fixtures, or distributed runtime
code.
