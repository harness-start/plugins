---
name: video-project-authoring
description: Orchestrate a new or existing evidence-bound Remotion video project from direction and storyboard through controlled media admission, composition, rendering, probes, independent review, and release. Use for motion explainers, product promos, short-form videos, talking-head edits, reference-led work, and micro-drama under artifacts/video; do not use for read-only critique or an unowned frame-exact replica.
---

# Video Project Authoring

Create an original video whose intent, script, assets, source, media outputs, measurements, review, and release stay digest-bound. The main agent owns project files, advisor integration, approvals, and final reporting.

## Required references

Read all of these before authoring:

- [Project contract](references/project-contract.md)
- [Profiles](references/profiles.md)
- [Skill composition](references/skill-composition.md)
- [Direction and design](references/direction-and-design.md)
- [External media admission](references/external-media-admission.md)
- [Quality gates](references/quality-gates.md)

## Workflow

1. Select one profile, `guided` or `autonomous` mode, and a kebab-case artifact id. Run `project-init.mjs <root> --profile <profile> --mode <mode>`.
2. Replace scaffold assumptions and freeze the direction, script, storyboard, design system, Skill composition, references, budget, and approval records before composition work.
3. Treat advisors as read-only. Record each current-source worker's `used`, `skipped`, or `unavailable` status. Integrate advice into project-owned JSON and TypeScript yourself.
4. Run external media generators or editors only outside the artifact root. Never expose credentials in commands or project files. Admit declared outputs with `project-admit.mjs <root> <external-run-manifest>`.
5. Implement visual units and audio/caption bindings whose half-open frame ranges project exactly from the storyboard. Keep each visual unit free of global scheduling, audio ownership, I/O, network, and wall-clock randomness.
6. Run `project-lint.mjs`, render every visual and audio unit, then render final. After a source, asset, direction, script, design, or timing change, restart at lint.
7. Run `project-probe.mjs`. Resolve media, timing, audio, caption, motion, and conditional reference findings before review.
8. Give only the current project root, final MP4, evidence, digests, and review-input contract to a separate `$video-project-review` session. The reviewer creates its input outside the project and invokes `project-review.mjs` itself.
9. After a current independent pass, run `project-release.mjs`. Report only release-manifest outputs and label verification claims with execution provenance.

Use every wrapper as one exact standalone command. Do not chain, redirect, pipe, substitute shell expressions, or let an external worker write proof, evidence, review, release, receipt, or admitted paths.
