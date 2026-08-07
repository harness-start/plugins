# intent-clarify-gate acceptance

## 01-open-deny-then-complete

### Host path (`expect.sh`)

Requires a real dual-host acceptance session log with product hook markers.
On inert logs (no hooks), `expect.sh` **fail-closed** (honesty gate).

### Offline fixture (`run-fixture.sh`)

Drives the shipped hook entry with stdin JSON (no live model):

1. UserPromptSubmit `/grill-me …` → open inject  
2. PreToolUse Write `src/app.js` → deny signal  
3. UserPromptSubmit `done` → closed
4. PreToolUse Write again → no deny  

```bash
bash plugins/intent-clarify-gate/acceptance/cases/01-open-deny-then-complete/run-fixture.sh
```
