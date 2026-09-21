import { InvocationPolicy, defineSkill, defineSkillGoal } from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "grok-delegate",
  fullName: "Grok Delegate",
  description: "Delegate a bounded coding implementation to the Grok Build CLI, then review its diff and land it from the parent. Use only when the user explicitly asks to delegate implementation to Grok or Grok Build. Do not use for direct implementation, ordinary Grok questions, or automatic provider selection.",
  useCases: [
    "The user explicitly asks the parent to have Grok Build implement, fix, or refactor a bounded coding task.",
  ],
  constraints: [
    "The parent owns the brief, review, verification, and authorized landing; the Grok implementer must not commit, stage, or push.",
    "Do not install or authenticate grok. Full access requires explicit human approval; Grok read-only mode is best-effort.",
    "This integration is protocol-tested offline and has not been live-verified against a real Grok provider session in this release.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: `# Grok Delegate

Use one explicit provider through the owner CLI. Do not call the private relay directly and do not start a provider fleet.

## Workflow

1. Write one self-contained brief with outcome, scope, exclusions, current evidence, actual repository gates, and report contract. State that the implementer must not commit, stage, or push.
2. Confirm the explicit user request for Grok delegation. Check only for an existing authenticated \`grok\` CLI; do not install or authenticate it.
3. Dispatch from the target Git worktree:

\`\`\`bash
DELEGATE_PLUGIN_ROOT="$PLUGIN_ROOT"
test -n "$DELEGATE_PLUGIN_ROOT" || DELEGATE_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
node "$DELEGATE_PLUGIN_ROOT/dist/cli/harness.mjs" delegate grok \\
  --brief brief.txt --cd "$PWD"
\`\`\`

The default is \`--always-approve --sandbox workspace\`. Use \`--read-only\` for best-effort plan intent, then verify the diff because it is not a hard no-write boundary. Use \`--full-access\` only after explicit human approval; by itself it disables the sandbox and auto-approves tools. If the native read-only sandbox cannot start because of an incompatible host path or kernel policy, explicit approval also permits combining \`--read-only --full-access\`: the relay disables the OS sandbox but retains plan mode and the read-only Git tripwire. Never make that fallback implicit.

4. Wait for process exit and inspect the printed \`result.json\` plus \`harnessAudit\`. Dirty worktrees are allowed. Treat HEAD or index changes as a failed parent boundary.
5. Review all tracked, staged, and untracked changes and re-run the real project gates. Never accept Grok's own report as proof.
6. Use \`--resume-last\` with a delta brief for bounded rework. The parent lands only within authorization and never pushes without a separate request.

The read-only flag and final Git audit are reporting tripwires. They do not cover ignored paths, submodule internals, perfect restores, or attribution of concurrent writes.
`,
  }),
  codexInterface: {
    shortDescription: "Delegate implementation to Grok Build, then review",
    defaultPrompt: "Use $grok-delegate to delegate this bounded coding task to Grok Build.",
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
