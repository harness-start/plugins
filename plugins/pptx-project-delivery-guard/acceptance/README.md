# PPTX guard acceptance

The live suite runs on Claude Code and Codex inside `docker/host-acceptance`. It covers ordinary-scope bypass, protected-path denial, and incomplete-release Stop blocking. The deterministic `tests/pipeline.test.ts` integration test exercises the complete one-page editable-deck pipeline with real LibreOffice and Poppler artifacts whenever that toolchain is installed; it skips on hosts without LibreOffice.
