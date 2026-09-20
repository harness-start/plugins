import { InvocationPolicy, defineSkill, defineSkillGoal } from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "agy-delegate",
  fullName: "Antigravity Delegate",
  description: "Delegate a bounded coding implementation to the Google Antigravity CLI (agy), then review its diff and land it from the parent. Use only when the user explicitly asks to delegate implementation to Antigravity or agy. Do not use for direct implementation, generic Google-model requests, or automatic provider selection.",
  useCases: [
    "The user explicitly asks the parent to have the Antigravity CLI implement, fix, or refactor a bounded coding task.",
  ],
  constraints: [
    "The parent owns the brief, review, verification, and authorized landing; the Antigravity implementer must not commit, stage, or push.",
    "Do not install or authenticate agy. Permission bypass requires explicit human approval and must be treated as full access.",
    "This integration is protocol-tested offline and has not been live-verified against a real Antigravity provider session in this release.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: `# Antigravity Delegate

Use one explicit provider through the owner CLI. Do not call the private relay directly and do not start a provider fleet.

## Workflow

1. Write one self-contained brief with outcome, scope, exclusions, current evidence, actual project gates, and a report contract. State that the implementer must not commit, stage, or push.
2. Confirm the user's explicit Antigravity delegation request. Check only for an existing authenticated \`agy\` CLI; do not install or authenticate it.
3. Dispatch from the target Git worktree:

\`\`\`bash
DELEGATE_PLUGIN_ROOT="$PLUGIN_ROOT"
test -n "$DELEGATE_PLUGIN_ROOT" || DELEGATE_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
node "$DELEGATE_PLUGIN_ROOT/dist/cli/harness.mjs" delegate agy \\
  --brief brief.txt --cd "$PWD"
\`\`\`

The relay uses Antigravity's native permission flow. Use \`--sandbox\` when the run should request its terminal sandbox. Use \`--read-only\` for plan mode. A headless write can be auto-denied; report that failure instead of silently widening access. Use \`--dangerously-skip-permissions\` only with explicit human approval and treat it as full access, including when combined with \`--sandbox\`.

4. Wait for process exit and inspect the printed \`result.json\` and \`harnessAudit\`. Dirty worktrees are allowed. A changed HEAD or index fails the parent boundary.
5. Inspect the complete final diff and re-run the repository's real gates. Provider output is a claim, not verification.
6. Re-dispatch a bounded delta brief when needed. The parent lands only within authorization and never pushes without a separate request.

Read-only reporting and Git audit are tripwires, not attribution or an OS security boundary. Ignored paths, submodule internals, perfect restores, and concurrent writes remain outside the audit.
`,
  }),
  codexInterface: {
    shortDescription: "Delegate implementation to Antigravity, then review",
    defaultPrompt: "Use $agy-delegate to delegate this bounded coding task to the Antigravity CLI.",
  },
  frontmatter: {
    version: "1.1.0",
    license: "MIT",
    metadata: {
      upstream: "amelnagdy/delegate-skills@f36c3db8f80a29ac064cdc6d1dd8f5c63a6c84ef",
      verification: "offline-protocol-only",
    },
  },
  sourceDir: new URL("./", import.meta.url),
});
