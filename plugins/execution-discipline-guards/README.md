# Execution Discipline Guards

Target-native controls for backup artifacts, debt markers, edit/retry loops, external skill isolation, garbled text, language drift, Markdown budgets, plan debt, reasoning depth, polling budgets, JSON/XML syntax, and long-task ledgers.

Twenty source hooks are consolidated into five lifecycle entries and five check/state modules. Node.js 20+ runs them directly with no installation, compilation, bundled SDK, or vendored source. Cross-event state lives only under `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA`; when neither exists, stateful checks fail open while stateless checks continue.

PostToolUse checks are advisory because the write already occurred. Language and reasoning completion controls use the Stop event's real blocking contract.
