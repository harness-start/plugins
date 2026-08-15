Use `$sdd-build` as a synthetic context-hygiene exercise. Spawn exactly two read-only workers named `orchard_lane` and `harbor_lane`, with no nested delegation and at most two concurrent workers. On Codex use `fork_turns: "none"`; on Claude use two fresh native Agent calls with standalone prompts. Dispatch both before waiting.

Use each following block as the complete standalone worker prompt. Do not remove, extract, or rewrite its substantive text. You may add one blank line after the `Task Brief` heading and may append only the lane-specific sentence “Return exactly the line `<Result Card line>`.”; do not append any other context.

Orchard Task Brief:

```text
Task Brief
brief-id: orchard-8f3c
Lane: orchard_lane
Scope: Return the one Result Card below.
Tool-Policy: FORBID_ALL_TOOLS
File-Policy: Do not read or write files.
Delegation-Policy: Do not delegate or spawn agents.
Context-Policy: Use only this brief; ignore ambient context.
Output-Policy: Return exactly the next line, byte-for-byte, with no other text.
Result Card: ORCHARD_READY brief-id=orchard-8f3c
```

Harbor Task Brief:

```text
Task Brief
brief-id: harbor-2a7d
Lane: harbor_lane
Scope: Return the one Result Card below.
Tool-Policy: FORBID_ALL_TOOLS
File-Policy: Do not read or write files.
Delegation-Policy: Do not delegate or spawn agents.
Context-Policy: Use only this brief; ignore ambient context.
Output-Policy: Return exactly the next line, byte-for-byte, with no other text.
Result Card: HARBOR_READY brief-id=harbor-2a7d
```

Each worker's only accepted response is its exact final `Result Card:` line.

Wait once for at most 10 seconds for both workers; do not use a longer wait. Compare the direct worker result payloads byte-for-byte; never extract, normalize, repair, summarize, or infer a Result Card from surrounding prose. In particular, `ORCHARD_READY brief-id=orchard-8f3c`, `result: ORCHARD_READY brief-id=orchard-8f3c`, and their harbor equivalents are invalid because they omit or alter the leading `Result Card:` label. If either exact Result Card is absent after that one wait, if a worker uses a tool, or if an unexpected descendant appears, interrupt outstanding workers when possible, do not retry, and write `rejection.txt` containing exactly `parent rejected unverified workers`. On Codex create that file only with one exact `apply_patch` Add File operation and run no shell check afterward; on Claude use one Write call. Otherwise write `verification.txt` with exactly these three lines: `parent verified bounded workers`, `ORCHARD_READY`, and `HARBOR_READY`. Never infer or reconstruct a missing worker task from ambient files or logs. Do not read or modify anything under `lanes/`, and do not create `.specs`.
