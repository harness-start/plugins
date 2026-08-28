# interface-design

`interface-design` improves the visual craft of web and application interfaces without binding the workflow to React, Vue, Flutter, or another framework. It combines an orchestration Skill, a read-only critique Skill, a mechanical craft floor, and lifecycle feedback that preserves visual continuity across edits.

## Purpose

Interface work often passes functional tests while still failing in hierarchy, spacing, typography, contrast, responsive behavior, motion, or design-system continuity. This plugin gives an agent a focused UI design contract and catches recognizable visual anti-patterns without turning subjective design judgment into a fake deterministic score.

## Design

One private module, `craft`, lives under `modules/`. The `interface-craft` Skill owns open-ended direction and repair. `interface-visual-critique` provides read-only review. `interface-craft-floor` describes mechanical constraints to apply immediately before editing UI. Hooks observe session context and changed interface files, then return bounded feedback or completion findings.

The plugin is self-contained for Claude Code and Codex. Installing it activates the complete surface; there are no capability profiles, framework profiles, or cross-owner Skill dependencies.

## Capabilities

| Capability | Public Skill or mechanism | What it covers |
| --- | --- | --- |
| UI direction and repair | `interface-craft` | Hierarchy, type, spacing, contrast, design-system continuity, responsive behavior, and restrained motion |
| Read-only visual review | `interface-visual-critique` | Evidence-based critique without editing or release authority |
| Mechanical craft floor | `interface-craft-floor` | Detectable anti-patterns such as arbitrary hard shadows, weak state treatment, and broken responsive assumptions |
| Session continuity | Session/Stop Hooks | Carries the selected visual direction through a coherent interface task and reports unresolved mechanical findings |
| Changed-file feedback | PostToolUse Hook | Reviews only relevant observed interface writes instead of scanning every language file in the repository |

## When to use it

Use it when designing a new page or application surface, repairing a visually weak UI, establishing or extending a design system, reviewing responsive layouts, improving accessibility-related visual hierarchy, or checking that motion and interaction states fit an existing product language. It applies to web and app interfaces even when the underlying framework differs.

## When not to use it

Do not use it for posters, logos, presentation decks, diagrams, print publications, or video; those belong to `artifact-production`. Do not use it as a substitute for functional frontend engineering, component tests, browser performance analysis, or a formal accessibility audit. A read-only critique request must not be converted into an implementation task.

## Runtime behavior

`SessionStart` supplies bounded craft context for relevant UI work. `PostToolUse` inspects host-observed interface changes and reports mechanical findings. `Stop` can surface unresolved craft-floor issues for an active interface task. The Hook does not require the user or agent to mention a Skill name, and Skill activation alone never establishes visual quality.

The module deliberately separates mechanically detectable issues from visual judgment. Hooks can identify known patterns and changed paths; the agent must still inspect the rendered interface, understand product context, and make design tradeoffs.

## Public interfaces

The public interfaces are the `interface-craft`, `interface-visual-critique`, and `interface-craft-floor` Skills plus the Claude Code and Codex Hooks. This owner has no public CLI and no MCP server. Framework-specific implementation knowledge may be provided by the host or project, but it is not a runtime dependency of this published plugin.

## Configuration and state

The plugin relies primarily on repository context and observed interface files rather than a capability-selection configuration. Any continuity state is scoped to the current project/session and exists only to connect a coherent design task across lifecycle events. It does not create a global design profile or import hidden workspace Skills.

## Boundaries

The plugin does not render a browser, inspect pixels by itself, or prove that a page is attractive, accessible, responsive, or production-ready. Mechanical checks are supporting evidence. Outcome validation should include the actual rendered states, target viewport sizes, interaction behavior, and product requirements. It never gains writer authority from a review-only Skill.

## Verification

```bash
node --import tsx --test \
  plugins/interface-design/tests/*.test.ts \
  plugins/interface-design/modules/craft/tests/*.test.ts
npm run check:dist
```

Live dual-host acceptance must run with `./scripts/acceptance/run.sh --plugin interface-design` under Docker.
