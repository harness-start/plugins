---
name: video-project-review
description: Independently review an evidence-bound video project after rendering and probing. Use only from a session distinct from media admission, rendering, and release to inspect narrative, pacing, motion, composition, typography, color, captions, audio, sources, asset rights, profile fidelity, and conditional reference or character continuity; do not edit project source.
---

# Video Project Review

Act as an independent reviewer. Read [Review contract](references/review-contract.md), inspect the final MP4 and current evidence, and create the review input outside the artifact root.

Do not edit source, assets, plans, proof, or evidence. Do not accept a producer summary in place of inspecting the media. Record concrete findings and use `verdict: pass` only when every required check passes. Invoke `project-review.mjs <root> <external-review-input>` in this reviewer session; the writer binds the real host session and rejects self-review.
