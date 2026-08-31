# Project-level acceptance

End-to-end **scenarios** that install the full catalog the way a user would
(`scripts/install-all.sh --local <checkout>` → every marketplace plugin + every
bundled Skills), then run a real Claude Code / Codex session
against a workspace fixture.

Unlike `plugins/*/acceptance/` (single-plugin, tightly scripted tool probes),
project scenarios use open-ended briefs and judge **final
world state + quality**, not a prescribed single tool call.

Workflow logs, Skill activation, and plugin receipts remain useful diagnostics,
but they are not project-level success criteria. A case passes only when its
requested artifacts, behavior, and repository scope pass the case's independent
checks.

## Layout

```text
acceptance/
  README.md
  scenarios/
    <domain>/                    # e.g. logo-design, research, pptx-...
      README.md
      cases/
        <case-id>/
          case.toml
          prompt.md              # open client brief
          expect.sh              # structural gates
          quality-rubric.md      # human-readable quality bar
          workspace/             # initial cwd
```

Case id on the CLI is `<domain>/<case-id>`, e.g.
`logo-design/01-goal-e2e-delivery`.

## Run

```bash
# honesty (no API)
./scripts/acceptance/run-project.sh --honesty-only

# one scenario case (Docker; first run builds install-all cache)
./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery

# one host only
./scripts/acceptance/run-project.sh \
  --case logo-design/01-goal-e2e-delivery \
  --host claude
```

Artifacts: `.acceptance-runs/project-latest/`
Install cache: under that out dir (`project-install-cache/`).

Project cases intentionally receive only capabilities installed from this checkout. Host-global Agent Skills are not mounted or seeded; a published plugin must pass in a clean consumer environment using its own declared bundle.

## Current scenarios

| Domain | Case | Intent |
| --- | --- | --- |
| `logo-design` | `01-goal-e2e-delivery` | open logo brief → observe logo artifact tree and quality notes |
| `software-change` | `01-fix-retry-delay` | narrow regression → focused RED/GREEN without unrelated full-suite execution |
| `research` | `01-rollout-decision-brief` | local evidence → sourced decision brief with explicit limitations |
| `configuration-change` | `01-update-retry-policy` | constrained request → exact config update with unrelated values preserved |

The normal CI validation runs scenario structure checks, gate self-tests, and
the inert-log honesty gate without model calls. Run the full command before a
release to execute every scenario against both installed hosts inside
`docker/host-acceptance`:

```bash
./scripts/acceptance/run-project.sh
```
