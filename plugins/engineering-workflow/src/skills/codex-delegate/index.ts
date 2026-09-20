import { InvocationPolicy, defineSkill, defineSkillGoal } from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "codex-delegate",
  fullName: "Codex Delegate",
  description: "Delegate a bounded coding implementation to the OpenAI Codex CLI, then review its diff and land it from the parent. Use only when the user explicitly asks to delegate implementation to Codex or run a coding task through Codex. Do not use for direct implementation by the current agent, review-only requests that need no implementer, or automatic provider selection.",
  useCases: [
    "The user explicitly asks a parent agent to have the Codex CLI implement, fix, or refactor a bounded coding task.",
  ],
  constraints: [
    "The parent owns the brief, review, verification, and authorized landing; the Codex implementer must not commit, stage, or push.",
    "Do not install or authenticate the codex CLI. Stop with the relay result when the existing CLI is unavailable or unauthenticated.",
    "This integration is protocol-tested offline and has not been live-verified against a real Codex provider session in this release.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: `# Codex Delegate

Use one explicit provider through the owner CLI. Do not call the private relay directly and do not start a provider fleet.

## Workflow

1. Inspect repository instructions and write one self-contained brief. Include the outcome, exact scope, exclusions, current evidence, actual test/lint/build gates, and a report contract. State that the implementer must not commit, stage, or push.
2. Confirm that the user explicitly requested Codex delegation. Confirm only that an existing \`codex\` CLI is available; do not install or authenticate it.
3. Dispatch from the target Git worktree:

\`\`\`bash
DELEGATE_PLUGIN_ROOT="$PLUGIN_ROOT"
test -n "$DELEGATE_PLUGIN_ROOT" || DELEGATE_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
node "$DELEGATE_PLUGIN_ROOT/dist/cli/harness.mjs" delegate codex \\
  --brief brief.txt --cd "$PWD"
\`\`\`

The default is Codex \`workspace-write\`. Use \`--read-only\` for a sandbox-enforced review or diagnosis, \`--session <thread-id>\` for exact-session rework, \`--resume-last\` only when no thread id exists, and \`--clean-env --keep-env NAME\` to restrict inherited environment variables. Never pass \`--skip-git-repo-check\`.

4. Wait for the process to exit and open the printed \`result.json\`. A dirty worktree is allowed: compare \`harnessAudit.baselineTouchedFiles\`, \`finalTouchedFiles\`, and \`changedSinceBaseline\`. These report final Git-visible state, not attribution. If \`headChanged\` or \`indexChanged\` is true, treat the run as failed and recover explicitly.
5. Review the complete working-tree and staged diff against the brief. Treat the implementer's report and test claims as untrusted. Re-run the repository's real gates yourself.
6. If rework is needed, send a delta brief to the same thread. Land the verified diff from the parent only when the user's authorization includes landing; otherwise leave it for review. Never push unless separately requested.

The audit excludes ignored paths, submodule internals, perfectly restored changes, and attribution of concurrent writes. Inspect the working tree directly before landing.
`,
  }),
  codexInterface: {
    shortDescription: "Delegate implementation to Codex, then review and land",
    defaultPrompt: "Use $codex-delegate to delegate this bounded coding task to Codex, then review the result.",
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
