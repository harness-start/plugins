# Python Runtime Guards

Python lockfile deny + encoding/debt/syntax reports

## Events

- **PreToolUse**: deny direct lockfile writes (`poetry.lock`, `pdm.lock`, `Pipfile.lock`, `uv.lock`)
- **SessionStart**: report `python-lint-coverage-primer` gaps in configured Ruff rule sets
- **UserPromptSubmit**: inject consolidated `python-env-detector` facts once per day
- **PostToolUse**: report encoding, net-new debt, syntax, and installed `python-lint-ruff` output

## Version

0.2.0
