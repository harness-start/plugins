#!/usr/bin/env bash
# Offline checks that the community skill-deps supply chain is gone.
#   bash scripts/acceptance/test-skill-deps-install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
failed=0
passed=0

pass() { printf 'ok %s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'not ok %s\n' "$1" >&2; failed=$((failed + 1)); }

leftover="$(find "${ROOT}/plugins" -name skill-deps.json -type f | sort || true)"
if [ -z "${leftover}" ]; then
  pass "no plugins/*/skill-deps.json"
else
  fail "skill-deps.json still present: ${leftover}"
fi

if [ ! -d "${ROOT}/vendor-skills" ]; then
  pass "vendor-skills/ absent"
else
  fail "vendor-skills/ still present"
fi

if [ ! -f "${ROOT}/scripts/update-vendor-skills.sh" ] && [ ! -f "${ROOT}/scripts/vendor-skills-index.mjs" ]; then
  pass "vendor maintainer scripts absent"
else
  fail "vendor maintainer scripts still present"
fi

fixture="$(mktemp -d)"
trap 'rm -rf "${fixture}"' EXIT
mkdir -p "${fixture}/bin" "${fixture}/home"
cat >"${fixture}/bin/claude" <<'EOF'
#!/usr/bin/env bash
printf 'claude %s\n' "$*" >>"${HOST_TRACE}"
case "$*" in *"plugin list"*) printf '[]\n' ;; esac
EOF
cat >"${fixture}/bin/codex" <<'EOF'
#!/usr/bin/env bash
printf 'codex %s\n' "$*" >>"${HOST_TRACE}"
case "$*" in *"plugin list"*) printf '[]\n' ;; esac
EOF
cat >"${fixture}/bin/npx" <<'EOF'
#!/usr/bin/env bash
printf 'npx %s\n' "$*" >>"${COMMUNITY_TRACE}"
EOF
chmod +x "${fixture}/bin/claude" "${fixture}/bin/codex" "${fixture}/bin/npx"
: >"${fixture}/community.trace"
HOME="${fixture}/home" \
  PATH="${fixture}/bin:${PATH}" \
  HOST_TRACE="${fixture}/host.trace" \
  COMMUNITY_TRACE="${fixture}/community.trace" \
  bash "${ROOT}/scripts/install-all.sh" \
    --local "${ROOT}" --dry-run --language en-US >/dev/null 2>"${fixture}/installer.log"
if [ -s "${fixture}/community.trace" ]; then
  fail "install-all.sh invoked a community Skill installer"
else
  pass "install-all.sh executes without a community Skill installer"
fi

if jq -e '.scripts | has("vendor:skills") or has("check:vendor-skills")' "${ROOT}/package.json" >/dev/null; then
  fail "package.json still has vendor skill scripts"
else
  pass "package.json vendor skill scripts removed"
fi

printf '\n==== skill-deps removal tests: passed=%s failed=%s ====\n' "${passed}" "${failed}"
[ "${failed}" -eq 0 ]
