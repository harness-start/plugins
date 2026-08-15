---
name: debug-workflow
description: Investigate and optionally fix concrete software failures with an evidence-first Debug Work Order. Use when the user provides or reports a reproducible error, failing test, stack trace, regression, flaky behavior, performance fault, or multiple known bugs and asks to diagnose, debug, or repair them; also use to resume an existing `.debug-workflow` ledger. Do not use for designing debugging tools or methodology, ordinary feature work, general code review or speculative bug hunting, cosmetic “fixes,” active production incidents before containment, or conceptual explanations that require no investigation.
---

# Debug Workflow

Open a Debug Work Order with the plugin CLI before changing production code. The writer is the activation signal for `debugging-workflow-guard`; merely loading this Skill, or editing a markdown file, does not activate hooks.

## Start or resume

1. Inspect the reported symptom and repository instructions without changing production code.
2. Resolve the plugin CLI and open a ledger. Do not Write or Edit files under `.debug-workflow/` except through this CLI.

```bash
DWG_PLUGIN_ROOT="${DEBUGGING_WORKFLOW_GUARD_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
if [ -z "$DWG_PLUGIN_ROOT" ]; then
  for DWG_CANDIDATE in \
    "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/harness-start/debugging-workflow-guard/* \
    "$HOME/.claude/plugins/cache/"*/debugging-workflow-guard \
    /marketplace/plugins/debugging-workflow-guard
  do
    [ -f "$DWG_CANDIDATE/dist/cli/debug-workflow.mjs" ] && DWG_PLUGIN_ROOT="$DWG_CANDIDATE" && break
  done
fi
test -f "$DWG_PLUGIN_ROOT/dist/cli/debug-workflow.mjs"
DWG="$DWG_PLUGIN_ROOT/dist/cli/debug-workflow.mjs"

node "$DWG" init --cwd "$PWD" \
  --slug short-slug \
  --summary "specific externally visible failure" \
  --expected "observable expected behavior" \
  --actual "observable failing behavior" \
  --repro "exact command used as the original reproduction" \
  --environment "relevant runtime and fixture"
```

3. Put every known bug in one ledger (`add-bug` for extras). Keep exactly one bug active with `activate --bug BUG-00N`.
4. State a main hypothesis and an independent backup hypothesis. Make each falsifiable. Optional `claim` events may record them; hooks do not require rewriting a snapshot.
5. On resume, choose one existing ledger and run `resume --id DWO-...`. Never let hooks choose among multiple work orders.

The default ledger is local-only under `.debug-workflow/<slug>/intent.json` plus append-only `events.jsonl`. The writer adds `/.debug-workflow/` to `.git/info/exclude` and never edits project `.gitignore`. Existing `.debug-workflow/*.md` files remain readable; do not treat them as the write surface.

Use `status` to read the folded state. Do not invent receipt IDs.

## Investigate

Work one bug at a time.

1. Run its exact `symptom.reproduction` before a production mutation. Invoke that command verbatim: do not add pipes, redirections, `; echo`, `|| true`, or another wrapper, because classification and native exit status are part of the receipt. Confirm that it fails for the reported reason, not merely with a nonzero exit.
2. Locate WHERE behavior first diverges from the last known-good path, then explain WHAT component is wrong.
3. Trace values backward from the failure to their source. Compare good/bad inputs or revisions and change one variable per experiment.
4. Use tests, throwaway probes, or temporary instrumentation. Prefix retained debug markers with `DBG_<sanitized-work-order-id>_<bug-id>`.
5. Cite hook-issued receipt IDs only after inspecting their command result. A receipt proves event order and outcome, not the truth of an interpretation.
6. Optional: `node "$DWG" claim --hypothesis H1 --status supported --receipt R-N` or `claim --root-cause "..." --chain "step|step" --receipt R-N`.

Do not patch by intuition. If the original reproduction is unavailable, `pause --next "..."` with a concrete recovery action and keep production files unchanged.

## Fix and verify

1. After the hook has a pre-mutation failing reproduction receipt for the active bug, make the smallest causal change. Shared fixes: `affect --bugs BUG-001,BUG-002` only after each affected bug has been activated and has its own failing reproduction receipt.
2. If an independent diagnosis would materially reduce uncertainty, ask a fresh generic read-only subagent to inspect the ledger and evidence. Describe the question in ordinary language, do not present the chosen root cause as authoritative, and treat the reply as advice that the parent must verify.
3. After three failed post-mutation reproductions, stop editing that bug. `pause --architecture-review --next "..."` or `activate` another bug. A fresh generic read-only subagent may challenge the architecture when useful, but the parent remains responsible for the decision.
4. Run the exact original reproduction again after the last production mutation. It must succeed.
5. Run at least one regression check for each affected bug. Never reuse another bug's receipt.
6. Remove debug instrumentation. Run a cleanup command that exits 0 only when the marker is absent.
7. Close with `node "$DWG" close` only after those hook-observed receipts exist. Do not copy `R-N` ids into a markdown snapshot.

A turn may end while the ledger remains open. Pause only for a real handoff or blocker.

## Coordinate multiple bugs

- `add-bug` newly discovered defects as queued; do not silently widen the active bug.
- Before a shared production edit, `activate` each affected bug and run its exact failing reproduction, then `activate` the fix owner and `affect --bugs ...`.
- A command for a non-active bug is still attributed to the active bug and does not establish that other bug's baseline.
- Use separate ledgers for truly parallel sessions. One ledger has one live session lease.

## End a turn

- For completed work, `close` after hook-backed verification and cite the ledger path or id.
- For interruption or external blockage, `pause --next "..."` with recovery commands and cite the path or id.
- Never invent receipt IDs or claim that hook activation alone established debugging effectiveness.
