# company-agent-plugins

Company-maintained dual-platform plugin marketplace for **Claude Code** and **Codex**.

Both hosts share plugin business scripts. Marketplace indexes, plugin manifests, and hook configs are maintained separately because field names, environment variables, and lifecycle events differ across platforms.

## Repository layout

```text
.
├── .claude-plugin/marketplace.json    # Claude Code marketplace
├── .agents/plugins/marketplace.json   # Codex marketplace
├── plugins/                           # Self-contained plugins live here
├── GUIDE.md                           # Full init / release guide
└── .github/workflows/validate-plugins.yml
```

Each plugin is self-contained. Do not reference files outside its own directory at runtime; Claude Code copies a single plugin directory into cache.

`GUIDE.md` uses example plugin names such as `session-hooks` and `policy-checks` for illustration only. Real plugins are registered under `plugins/` and listed in both marketplace indexes.

## Prerequisites

- Git
- Node.js 20+
- Claude Code CLI
- Codex CLI
- `jq` (recommended)

## Local static checks

```bash
find .claude-plugin .agents/plugins plugins \
  -type f -name '*.json' -print0 |
while IFS= read -r -d '' file; do
  echo "Validating $file"
  jq empty "$file"
done

for file in plugins/*/scripts/*.mjs; do
  [ -e "$file" ] || continue
  node --check "$file"
done

for plugin in plugins/*; do
  [ -d "$plugin" ] || continue
  claude_version="$(jq -r '.version' "$plugin/.claude-plugin/plugin.json")"
  codex_version="$(jq -r '.version' "$plugin/.codex-plugin/plugin.json")"
  test "$claude_version" = "$codex_version"
done
```

## Claude Code

```bash
claude plugin validate --strict .
claude plugin marketplace add "$(pwd)"
# claude plugin install <plugin-name>@company-agent-plugins
```

## Codex

```bash
codex plugin marketplace add . --json
codex plugin list --marketplace company-agent-plugins --available --json
# codex plugin add <plugin-name>@company-agent-plugins --json
```

Codex does not auto-trust plugin hooks. Review and trust hook definitions before they run. Install success alone does not prove hooks executed; start a new session and verify.

## Adding a plugin

See `GUIDE.md` section 16. Register the plugin in both:

- `.claude-plugin/marketplace.json`
- `.agents/plugins/marketplace.json`

## Docs

- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins#build-your-own-curated-plugin-list)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)
