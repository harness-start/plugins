# language-output-governance

`language-output-governance` keeps Claude Code and Codex natural-language prose aligned with one stable session profile. It replaces `in-chinese`; Simplified Chinese remains the default rather than a separate plugin.

## Profiles

The plugin includes five profiles:

| Profile | Natural-language scripts allowed by the profile |
| --- | --- |
| `zh-CN` | Han |
| `en-US` | Latin technical and prose text; Han, Hangul, Kana, and Thai are checked |
| `ja-JP` | Han and Kana |
| `ko-KR` | Hangul |
| `th-TH` | Thai |

Latin text is always allowed so commands, APIs, types, identifiers, and technical terms do not create false positives. The detector does not try to distinguish Chinese from Japanese when both use Han characters.

## Lifecycle

- `SessionStart` loads the configured default and injects the active profile marker.
- `UserPromptSubmit` records an explicit response-language request for the session. Translation requests authorize their target language without changing the preferred profile.
- `PostToolUse` checks only model-generated tool input for Bash, Write, Edit, MultiEdit, and apply_patch. Quoted shell payloads are checked as independent candidate segments so command syntax does not dilute natural-language text. It never scans command or tool output, and reports at most once per session.
- `Stop` and `SubagentStop` request a complete rewrite when final prose contains an unauthorized script. Recursive Stop retries fail open.

The main agent and subagents share the parent session state. State contains only profile IDs and one feedback flag; it never stores prompts, replies, commands, or file content.

Claude and standard Codex providers receive `PostToolUse.additionalContext`. Codex 0.146 loses the original tool result when the repository's DeepSeek acceptance provider receives model-visible PostToolUse feedback, so that specific runtime combination suppresses the advisory and leaves the feedback flag unclaimed; Stop remains the correction boundary. This compatibility branch is selected only when both `PLUGIN_ROOT` and `DEEPSEEK_MODEL` are present.

## Project configuration

Create `.language-output-governance.mjs` at the Git root:

```js
export default {
  defaultProfile: "zh-CN",
  toolFeedback: "report", // report | off
  stop: "block",          // block | off
  detection: {
    minScriptCharacters: 12,
    minLetterRatio: 0.25,
  },
};
```

The configuration is project-owned trusted executable configuration loaded through `import()`. Invalid fields or values produce a warning and retain the strict defaults. Thresholds are bounded to `1..100` script characters and `0.01..1` letter ratio.

Use the bundled `language-output-governance-config` Skill to initialize or diagnose the file. The complete contract is in [DESIGN.md](./DESIGN.md).

## Detection boundaries

The detector checks each line and the complete candidate text. Fenced code, inline code, Markdown quotation lines, URLs, and link targets are excluded. It is a deterministic Unicode Script guard, not a general natural-language classifier.

## Migrating from `in-chinese`

`language-output-governance@0.2.0` replaces the old plugin identity. `scripts/install-all.sh` removes marketplace plugins before reinstalling the current catalog. Manual installations should uninstall `in-chinese` and install `language-output-governance`; there is no compatibility alias or legacy configuration read.

## Verification

From the marketplace root:

```bash
node --test plugins/language-output-governance/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin language-output-governance
```

The acceptance command needs Docker and the DeepSeek credentials documented by the repository acceptance runner.
