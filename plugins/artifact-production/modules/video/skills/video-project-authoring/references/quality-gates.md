# Quality gates

Lint checks the staged JSON contracts, declared Skill names and modes, approvals, rights, shot selections, frame projections, source ownership, and deterministic Remotion wiring. Render measures each unit and final output before promotion. Probe measures container/streams, duration, frame boundaries, captions, audio, selected shot frames, and declared reference fidelity.

Automated checks prove structural and media facts only. Narrative clarity, aesthetic quality, factual truth, rights truth, selected-shot fidelity, and human approval identity require independent review. Selected shots add a mandatory `shotFidelity` check and bind review to `evidence.shots.json`. Release also requires a declared Remotion license status. A successful command or non-empty MP4 is not release evidence.
