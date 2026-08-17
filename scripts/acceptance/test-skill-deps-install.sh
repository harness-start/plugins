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

if grep -Eq -- '--skip-skill-deps|HARNESS_SKIP_SKILL_DEPS|npx --yes skills add' "${ROOT}/scripts/install-all.sh"; then
  fail "install-all.sh still installs community skills"
else
  pass "install-all.sh does not install community skills"
fi

if grep -q '"vendor:skills"' "${ROOT}/package.json" || grep -q '"check:vendor-skills"' "${ROOT}/package.json"; then
  fail "package.json still has vendor skill scripts"
else
  pass "package.json vendor skill scripts removed"
fi

printf '\n==== skill-deps removal tests: passed=%s failed=%s ====\n' "${passed}" "${failed}"
[ "${failed}" -eq 0 ]
