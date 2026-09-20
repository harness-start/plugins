import { InvocationPolicy, defineSkill, defineSkillGoal } from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "pi-delegate",
  fullName: "Pi Delegate",
  description: "Delegate a bounded coding implementation to the Pi coding agent CLI, then review its diff and land it from the parent. Use only when the user explicitly asks to delegate implementation to Pi or the pi CLI. Do not use for direct implementation, mathematical pi requests, or automatic provider selection.",
  useCases: [
    "The user explicitly asks the parent to have the Pi coding agent implement, fix, or refactor a bounded coding task.",
  ],
  constraints: [
    "The parent owns the brief, review, verification, and authorized landing; the Pi implementer must not commit, stage, or push.",
    "Do not install or authenticate pi. Pi has no sandbox; project-local .pi resources require explicit approval.",
    "This integration is protocol-tested offline and has not been live-verified against a real Pi provider session in this release.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: `# Pi Delegate

Use one explicit provider through the owner CLI. Do not call the private relay directly and do not start a provider fleet.

## Workflow

1. Write one self-contained brief with outcome, scope, exclusions, evidence, actual repository gates, and a report contract. State that the implementer must not commit, stage, or push.
2. Confirm the explicit user request for Pi delegation. Check only for an existing authenticated \`pi\` CLI; do not install or authenticate it.
3. Dispatch from the target Git worktree:

\`\`\`bash
DELEGATE_PLUGIN_ROOT="$PLUGIN_ROOT"
test -n "$DELEGATE_PLUGIN_ROOT" || DELEGATE_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
node "$DELEGATE_PLUGIN_ROOT/dist/cli/harness.mjs" delegate pi \\
  --brief brief.txt --cd "$PWD"
\`\`\`

Pi has no sandbox or permission mode. The relay passes \`--no-approve\` by default so project-local \`.pi\` settings, extensions, and skills are not trusted. Pass \`--approve\` only after explicit human approval for that repository. Use \`--read-only\` to expose only read/grep/find/ls tools, while remembering that installed extension code still has host permissions. Select a configured provider/model with \`--provider\` and \`--model\` when the user asks.

4. Wait for process exit and inspect the printed \`result.json\` plus \`harnessAudit\`. Dirty worktrees are allowed. A changed HEAD or index fails the parent boundary.
5. Inspect the full diff and re-run the actual project gates. Treat the implementer's message as an unverified claim.
6. Use \`--session <id>\` or \`--resume-last\` with a delta brief for rework. The parent lands only within authorization and never pushes without a separate request.

The Git audit cannot cover ignored paths, submodule internals, perfectly restored changes, or concurrent-write attribution. Because Pi is unsandboxed, run it only in a host environment the user accepts.
`,
  }),
  codexInterface: {
    shortDescription: "Delegate implementation to Pi, then review and land",
    defaultPrompt: "Use $pi-delegate to delegate this bounded coding task to the Pi coding agent CLI.",
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
