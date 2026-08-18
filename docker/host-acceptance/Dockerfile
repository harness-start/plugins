# Host-acceptance image: real Claude Code + Codex CLIs for DeepSeek V4 Flash.
# Plugin sources are mounted at runtime; this image only pins host toolchains.
#
# Claude refuses --dangerously-skip-permissions as root, so the image default
# USER is non-root. run.sh also passes --user $(id -u):$(id -g) so /out writes
# match the host owner.
FROM node:20-bookworm

ARG CLAUDE_CODE_VERSION=2.1.170
ARG CODEX_VERSION=0.147.0
ARG CHROMIUM_VERSION=151.0.7922.137-1~deb12u1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       ffmpeg \
       git \
       jq \
       php-cli \
       unzip \
  && rm -rf /var/lib/apt/lists/*

# Fixed-document acceptance toolchain for editable PPTX delivery plugins.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       fonts-noto-cjk \
       fonts-noto-core \
       libreoffice-impress \
       poppler-utils \
  && rm -rf /var/lib/apt/lists/*

# Fixed browser for rendered responsive interface acceptance.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       chromium="${CHROMIUM_VERSION}" \
  && chromium --version \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
  && claude --version \
  && codex --version

# Composer is available for PHP-based acceptance workspaces.
RUN curl -sS https://getcomposer.org/installer \
  | php -- --install-dir=/usr/local/bin --filename=composer \
  && composer --version

WORKDIR /marketplace
COPY models.json /opt/acceptance/models.json
COPY entrypoint.sh /opt/acceptance/entrypoint.sh
RUN chmod +x /opt/acceptance/entrypoint.sh \
  && chown -R node:node /opt/acceptance

# node:20-bookworm ships non-root user `node` (uid 1000). run.sh overrides with
# --user host-uid:host-gid so /out matches the host owner.
USER node
ENV HOME=/home/node

ENTRYPOINT ["/opt/acceptance/entrypoint.sh"]
