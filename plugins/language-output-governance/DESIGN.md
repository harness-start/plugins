# language-output-governance design

## Responsibility

The plugin governs the natural-language output language for one host session. It does not control tone, personality, verbosity, formatting, translation quality, or tool output.

## Session model

The state is `preferredProfile`, a bounded set of `authorizedProfiles`, and `toolFeedbackDelivered`. `SessionStart` resets startup/clear sessions and preserves resume/compact sessions. An explicit conversation-language request may replace the preferred profile; translation intent only adds an authorization. There is no turn-level profile or revocation protocol.

State is stored under the host plugin-data directory, keyed by a SHA-256 digest of the session ID, atomically replaced under a per-session lock, and treated as expired after 24 hours. Parent and subagent hooks use the same session ID.

## Configuration

`.language-output-governance.mjs` accepts only:

```js
{
  defaultProfile?: "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "th-TH",
  toolFeedback?: "report" | "off",
  stop?: "block" | "off",
  detection?: {
    minScriptCharacters?: number,
    minLetterRatio?: number,
  },
}
```

Any unsupported or invalid field makes the complete configuration fall back to the strict defaults. Custom detector callbacks, arbitrary profiles, path overrides, and legacy `in-chinese` reads are outside the contract.

## Detection

The profile and explicit authorizations form a union of allowed Unicode Scripts. Every remaining Han, Hangul, Kana, or Thai script is checked against the configured minimum count and Unicode-letter ratio. Latin is not guarded. Markdown code, quotation lines, URLs, and link targets are removed before counting.

PostToolUse extracts only generated input: command text plus its quoted payloads, file content, replacement strings, or added patch lines. Quoted shell payloads are separate candidate segments so surrounding command syntax cannot dilute their letter ratio. Stop checks only the host-provided final assistant message. Tool responses and command output are never scanned.

PostToolUse feedback uses `hookSpecificOutput.additionalContext` on Claude and standard Codex providers. Codex 0.146 drops the original tool result when the DeepSeek acceptance provider receives model-visible PostToolUse feedback. For the narrowly identifiable `PLUGIN_ROOT` + `DEEPSEEK_MODEL` combination, the hook therefore emits nothing and does not claim `toolFeedbackDelivered`; Stop remains the correction boundary. Other runtimes keep the normal soft-feedback path.
