# Host-acceptance image: real Claude Code + Codex CLIs for DeepSeek V4 Flash.
# Plugin sources are mounted at runtime; this image only pins host toolchains.
FROM node:20-bookworm

ARG CLAUDE_CODE_VERSION=2.1.170
ARG CODEX_VERSION=0.146.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       git \
       jq \
       php-cli \
       unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
  && claude --version \
  && codex --version

# Composer (optional; php-runtime-guards post checks)
RUN curl -sS https://getcomposer.org/installer \
  | php -- --install-dir=/usr/local/bin --filename=composer \
  && composer --version

WORKDIR /marketplace
COPY models.json /opt/acceptance/models.json
COPY entrypoint.sh /opt/acceptance/entrypoint.sh
RUN chmod +x /opt/acceptance/entrypoint.sh

ENTRYPOINT ["/opt/acceptance/entrypoint.sh"]
