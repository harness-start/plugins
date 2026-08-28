# Language output governance

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `session-governance` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`language-output` keeps response language consistent across a Claude Code or Codex session while allowing generated files to follow a separate project artifact-language contract. The installer selects the response profile from the system locale by default. If neither the host nor project supplies a preference, the strict default is Simplified Chinese.

The module governs natural-language script selection. It does not control tone, personality, detail, formatting, translation quality, or tool output.

## Profiles

| Profile | Allowed natural-language scripts |
| --- | --- |
| `zh-CN` | Han, with Simplified Chinese guidance |
| `zh-TW` | Han, with Traditional Chinese guidance |
| `en-US` | Latin; checks Han, Hangul, Kana, and Thai |
| `ja-JP` | Han and Kana |
| `ko-KR` | Hangul |
| `th-TH` | Thai |

Latin remains allowed for every profile so commands, APIs, types, identifiers, and technical terms do not create false positives. The detector does not attempt general language classification.

## Lifecycle and state

- `SessionStart` loads configuration, initializes session state, and publishes both the response and artifact profiles.
- `UserPromptSubmit` records explicit response-language changes and temporary translation authorization. Translation does not replace the preferred response profile.
- `PostToolUse` checks model-generated Bash, Write, Edit, MultiEdit, and apply-patch inputs against the artifact profile. It never scans command or tool output and reports at most once per session.
- `Stop` and `SubagentStop` check final prose against the response profile. A host retry marked with `stop_hook_active` is allowed to prevent an infinite loop.

State contains `preferredProfile`, a bounded `authorizedProfiles` set, and `toolFeedbackDelivered`. It does not store prompts, replies, commands, or file content. The state key hashes the host platform and trusted session ID, is written atomically under `.language-output/state/`, and expires after 24 hours. Missing trusted session identity does not create shared sticky state.

Claude receives PostToolUse feedback through `hookSpecificOutput.additionalContext`. Codex receives the same semantic feedback through the host tool-lifecycle protocol on stderr.

## Configuration

Configuration precedence is:

1. Git-root `.language-output.mjs`
2. Host preference written by the installer
3. Strict defaults

The host preference contains only `defaultProfile`. Claude reads it below `CLAUDE_CONFIG_DIR` (default `~/.claude`); Codex reads it below `CODEX_HOME` (default `~/.codex`). Both use `harness-start/language-output.json` as the relative path.

Project override example:

```js
export default {
  defaultProfile: "zh-CN",
  artifactProfile: "en-US",
  toolFeedback: "report", // report | off
  stop: "block",          // block | off
  detection: {
    minScriptCharacters: 12,
    minLetterRatio: 0.25,
  },
};
```

`defaultProfile` governs responses and session language intent. `artifactProfile` is optional; when omitted, generated files use the active response profile. Set it when a project has a stable file-language contract that differs from conversation. Explicit user and project-owned artifact-language requirements take precedence in agent guidance, while `artifactProfile` supplies the deterministic PostToolUse profile.

The accepted top-level fields are `defaultProfile`, `artifactProfile`, `toolFeedback`, `stop`, and `detection`. Both profile fields accept `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`, or `th-TH`; `artifactProfile` may also be `null`. Detection accepts `minScriptCharacters` from 1 through 100 and `minLetterRatio` from 0.01 through 1. Any unknown or invalid field makes the complete project configuration fall back to strict defaults.

`.language-output.mjs` is trusted project-owned executable configuration loaded through `import()`. Use the bundled `language-output-config` Skill to initialize or diagnose it.

## Detection boundaries

The detector checks individual lines and the complete candidate. It excludes fenced code, inline code, Markdown quotation lines, URLs, and link targets before counting. PostToolUse considers generated input, including quoted shell payloads, file content, replacement strings, and added patch lines. Stop considers only the host-provided final assistant message.

Han receives additional variant checks: `zh-CN` rejects substantial Traditional-only characters, `zh-TW` rejects substantial Simplified-only characters, and `ja-JP` rejects substantial Han text without Kana as likely Chinese. Ambiguous one-to-many variants are not scored.

This is a deterministic Unicode-script guard. Latin prose is not blocked on Chinese profiles because doing so would create excessive technical false positives.

## Verification

From the marketplace root:

```bash
node --import tsx --test plugins/session-governance/modules/language/tests/*.test.ts plugins/session-governance/modules/language/tests/entries/hooks/*.test.ts
./scripts/acceptance/run.sh --plugin session-governance
```

Live acceptance requires Docker and the credentials documented by the repository acceptance runner.
