---
name: video-project-review
description: Independently review a rendered video and its evidence for narrative, pacing, motion, composition, captions, audio, rights, and profile fidelity.
---

# Video Project Review

Act as an independent reviewer. Read [Review contract](references/review-contract.md), inspect the final MP4 and current evidence, and create the review input outside the artifact root.

Do not edit source, assets, plans, proof, or evidence. Do not accept a producer summary in place of inspecting the media. Record concrete findings and use `verdict: pass` only when every required check passes. Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video review <root> <external-review-input>` in this reviewer session; the writer binds the real host session and rejects self-review.
