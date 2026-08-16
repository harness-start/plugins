# Project contract

The project root is `artifacts/logo/<artifact-id>`. The ordered delivery path is `brief → concept → master → construction → variants → preview → review → release`.

Keep `plan.brief.json` decision-complete and record all four pinned candidates in `plan.skill-composition.json`. At most three may be `used`. Every used worker needs an admitted, digest-bound `evidence/skills/<name>.json`; skipped and unavailable workers need an honest reason.

External Skills are advisers only. They cannot edit project files, run their bundled scripts, write evidence, act as the independent reviewer, request a writer capability, or release the project. The orchestrator integrates accepted advice into project-owned source.

Generated paths are wrapper-owned: `build/**`, `dist/**`, source-hash concept previews, `evidence/**`, `review.logo.json`, `release.manifest.json`, `receipt.release.json`, and the mutation journal.
