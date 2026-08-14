# language-output-governance host acceptance

The eight cases run real Claude Code and Codex sessions in Docker. Every built-in profile has at least one case.

| Case | Profile | Behavior |
| --- | --- | --- |
| `01-zh-cn-governance` | `zh-CN` | Default profile, PostToolUse repair, and Stop rewrite |
| `02-en-us-profile` | `en-US` | Configured English profile |
| `03-ja-jp-profile` | `ja-JP` | Configured Japanese profile |
| `04-ko-kr-profile` | `ko-KR` | Configured Korean profile |
| `05-th-th-profile` | `th-TH` | Configured Thai profile |
| `06-zh-tw-profile` | `zh-TW` | Configured Traditional Chinese profile |
| `07-recursive-stop-blocks` | `zh-CN` | Stop behavior when the user explicitly requests another language |
| `08-structured-values` | `zh-CN` | Structured natural-language values follow the profile while JSON keys stay unchanged |

The repository's Codex acceptance host uses DeepSeek. Codex 0.146 cannot preserve the original tool result when that provider receives model-visible PostToolUse feedback, so the Chinese Codex path asserts safe suppression plus Stop correction; the Claude path asserts the real soft-feedback marker. Standard Codex providers retain the normal PostToolUse feedback path, covered by the hook integration test.

From the repository root:

```bash
./scripts/acceptance/run.sh --plugin language-output-governance
./scripts/acceptance/run.sh --honesty-only
```
