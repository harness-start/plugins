# Tool carrier only. Per-instance agent images copy these pinned tools onto the
# official SWE-bench instance image; this image never runs an agent itself.
FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5

ARG CLAUDE_CODE_VERSION=2.1.170
ARG CODEX_VERSION=0.147.0

RUN npm install --global \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
  && claude --version \
  && codex --version

COPY docker/host-acceptance/models.json /opt/harness/models.json
COPY benchmarks/swe-bench/src/harness_swe_bench /opt/harness/harness_swe_bench

ENV PYTHONPATH=/opt/harness
