# Skill composition

The orchestrator owns decisions and project files. First-party advisors return recommendations, rationale, risks, and measurable checks.

When an adviser is selected, read its exact bundled instructions from [motion direction](../../video-motion-direction/SKILL.md), [format playbooks](../../video-format-playbooks/SKILL.md), [visual critique](../../video-visual-critique/SKILL.md), [media import](../../video-media-import/SKILL.md), or [shot recipes](../../video-shot-recipes/SKILL.md). Never substitute session-global knowledge or a similarly named Skill.

| Worker | Mode | Contribution |
|---|---|---|
| `video-motion-direction` | advisor | motion thesis, animation principles, shot language, color motion |
| `video-format-playbooks` | advisor | explainer, short-form, product-launch, caption pacing |
| `video-visual-critique` | advisor | hierarchy, contrast, craft notes |
| `video-media-import` | external-runner | admit user-provided media already on disk |
| `video-shot-recipes` | advisor | pinned offline recipe lookup, beat selection, and source staging |

`video-media-import` does not call a vendor API or require a provider key. Place media outside the artifact, then admit it with `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video admit`. Do not execute community generators. Record each worker as `used`, `skipped`, or `unavailable`.
