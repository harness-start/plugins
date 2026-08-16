# External media admission

Run approved TTS, image/video generation, or editing tools outside the artifact root. Their run manifest declares the Skill and revision, provider/model, input digests, cost, rights, approval digest, and candidate output paths. Secrets stay in environment variables and never appear in the manifest.

`project-admit.mjs` accepts only regular, non-symlink image, audio, video, subtitle, or font files. It rejects traversal, executable/archive extensions, invalid audio/video streams, undeclared outputs, stale approvals, digest mismatches, and budget violations. Accepted bytes move into `public/admitted/` with admission evidence; the manifest is declared provenance, not cryptographic proof of a provider's identity.
