# Project-level acceptance

End-to-end **scenarios** that install the full catalog the way a user would
(`scripts/install-all.sh --local <checkout>` → every marketplace plugin + every
`skill-deps.json` community skill), then run a real Claude Code / Codex session
against a workspace fixture.

Unlike `plugins/*/acceptance/` (single-plugin, tightly scripted tool probes),
project scenarios use open-ended `/goal <objective>` prompts and judge **final
world state + quality**, not a prescribed single tool call.

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
          prompt.md              # typically starts with /goal …
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

Optional: mount host Agent Skills so design skills (logo-design, etc.) are
available inside the case HOME:

```bash
ACCEPT_HOST_SKILLS_DIR="$HOME/.agents/skills" \
  ./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery
```

The Docker wrap auto-mounts `$HOME/.agents/skills` when present.

## Current scenarios

| Domain | Case | Intent |
| --- | --- | --- |
| `logo-design` | `01-goal-e2e-delivery` | `/goal` logo brief → observe logo artifact tree, goal trail, quality notes |
