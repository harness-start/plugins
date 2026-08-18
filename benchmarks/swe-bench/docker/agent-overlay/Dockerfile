ARG TOOL_IMAGE=harness-swe-agent-tools:local
ARG INSTANCE_IMAGE

FROM ${TOOL_IMAGE} AS agent_tools

FROM ${INSTANCE_IMAGE}

USER root

# Runtime utilities are added above the exact official evaluator image. They do
# not alter the clean image later used by the official grader.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       jq \
       python3-yaml \
       util-linux \
  && rm -rf /var/lib/apt/lists/*

COPY --from=agent_tools /usr/local/bin/node /usr/local/bin/node
COPY --from=agent_tools /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe /usr/local/bin/claude \
  && ln -s ../lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex
COPY --from=agent_tools /opt/harness /opt/harness

ENV PYTHONPATH=/opt/harness
WORKDIR /testbed
ENTRYPOINT ["/usr/bin/python3", "-m", "harness_swe_bench.container_entry"]
