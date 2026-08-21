# Dual-host acceptance

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin engineering-practice
```

The harness creates isolated Claude Code and Codex sessions inside the `docker/host-acceptance` container. The plugin bundles every Skill it references.

- `01-implementation-and-verify`: exercises implementation routing and fresh verification without naming a Skill in the prompt.
- `02-review-regression`: requests a read-only review and checks severities and exact file anchors.
- `03-simple-control`: confirms a simple precise response receives only the lightweight session context.

Acceptance covers only these isolated scenarios. It does not treat Skill loading or hook activation as a hard gate or as proof of engineering quality.
