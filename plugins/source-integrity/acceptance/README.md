# source-integrity acceptance

Both cases run on Claude Code and Codex in the Docker host-acceptance harness. `01-deny-backup-artifact` requires a real PreToolUse signal and verifies that a requested backup artifact was never created. `02-repair-utf8-bom` requires the PostToolUse encoding signal and verifies that the repaired source is valid BOM-free UTF-8.
