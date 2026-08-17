---
name: video-media-import
description: Admit user-owned media already on disk into a video project through the plugin admit writer. Use when the user supplies local image, audio, video, subtitle, or font files; do not use to call vendor APIs or generate media from a key.
---

# Video media import

This Skill is an **external-runner** only for files the user already placed on disk. It cannot write protected proof, evidence, review, or release paths. It cannot call vendor APIs or require an API key.

## Procedure

1. Keep source media outside `artifacts/video/<id>/`.
2. Record each file in an external-run manifest with `assetId`, absolute `path`, and SHA-256.
3. Admit with `project-admit.mjs <root> <external-run-manifest>`.
4. Mark this worker `used` only after the admit receipt binds the current bytes under `public/admitted/`.

Do not execute community generators, TTS, or cut/subtitle CLIs.
