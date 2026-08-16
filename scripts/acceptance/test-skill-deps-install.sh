#!/usr/bin/env bash
# Offline + optional network checks for acceptance skill-deps helpers.
# Usage:
#   bash scripts/acceptance/test-skill-deps-install.sh
#   ACCEPT_TEST_NETWORK=1 bash scripts/acceptance/test-skill-deps-install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

failed=0
passed=0

pass() {
  printf 'PASS %s\n' "$*"
  passed=$((passed + 1))
}

fail() {
  printf 'FAIL %s\n' "$*" >&2
  failed=$((failed + 1))
}

assert_eq() {
  local label="$1" got="$2" want="$3"
  if [ "${got}" = "${want}" ]; then
    pass "${label}"
  else
    fail "${label}: got=$(printf '%q' "${got}") want=$(printf '%q' "${want}")"
  fi
}

assert_ok() {
  local label="$1"
  shift
  if "$@"; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

assert_fail() {
  local label="$1"
  shift
  # Keep pass/fail on the test harness stdout; silence command noise only.
  if "$@" >/dev/null 2>&1; then
    fail "${label}: expected non-zero"
  else
    pass "${label}"
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

# --- parse: valid -------------------------------------------------------------
valid_json='{"skills":[{"name":"grill-me","source":"https://github.com/mattpocock/skills","revision":"068b6e0c62393147daf03530149cdce209c93da8"}]}'
got="$(parse_skill_deps_json "${valid_json}" "valid.json")"
assert_eq "parse valid name/source" "${got}" $'grill-me\thttps://github.com/mattpocock/skills\t068b6e0c62393147daf03530149cdce209c93da8\t'

pinned_json='{"skills":[{"name":"grill-me","source":"https://github.com/mattpocock/skills","revision":"068b6e0c62393147daf03530149cdce209c93da8"}]}'
got="$(parse_skill_deps_json "${pinned_json}" "pinned.json")"
assert_eq "parse pinned revision" "${got}" $'grill-me\thttps://github.com/mattpocock/skills\t068b6e0c62393147daf03530149cdce209c93da8\t'

nested_json='{"skills":[{"name":"musical-dna","source":"https://github.com/jwynia/agent-skills","revision":"e02ec7e226a6e4f8419fd3b88a1d8e472d421b32","subpath":"skills/creative/music/musical-dna"}]}'
got="$(parse_skill_deps_json "${nested_json}" "nested.json")"
assert_eq "parse pinned nested skill" "${got}" $'musical-dna\thttps://github.com/jwynia/agent-skills\te02ec7e226a6e4f8419fd3b88a1d8e472d421b32\tskills/creative/music/musical-dna'

invalid_revision_json='{"skills":[{"name":"grill-me","source":"https://github.com/mattpocock/skills","revision":""}]}'
assert_fail "reject empty pinned revision" parse_skill_deps_json "${invalid_revision_json}" "invalid-revision.json"
assert_fail "reject missing pinned revision" parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo"}]}' "missing-revision.json"
assert_fail "reject unapproved executable" parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo","revision":"0123456789012345678901234567890123456789","mode":"audited-executable","execution":{"approved":false,"paths":[{"path":"scripts/x.py","sha256":"0123456789012345678901234567890123456789012345678901234567890123"}]}}]}' "unapproved-executable.json"
assert_fail "reject escaping skill subpath" \
  parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo","subpath":"../x"}]}' "invalid-subpath.json"

empty_json='{"skills":[]}'
got="$(parse_skill_deps_json "${empty_json}" "empty.json" || true)"
assert_eq "parse empty skills" "${got}" ""

# --- parse: invalid -----------------------------------------------------------
assert_fail "parse rejects missing skills key" \
  parse_skill_deps_json '{"nope":true}' "bad.json"
assert_fail "parse rejects empty name" \
  parse_skill_deps_json '{"skills":[{"name":"","source":"https://example.com"}]}' "bad.json"
assert_fail "parse rejects empty source" \
  parse_skill_deps_json '{"skills":[{"name":"x","source":""}]}' "bad.json"

# --- catalog identity conflict ------------------------------------------------
conflict_market="${tmp}/conflict-market"
mkdir -p "${conflict_market}/.claude-plugin" "${conflict_market}/plugins/a" "${conflict_market}/plugins/b"
printf '{"plugins":[{"name":"a","source":"./plugins/a"},{"name":"b","source":"./plugins/b"}]}\n' >"${conflict_market}/.claude-plugin/marketplace.json"
printf '{"skills":[{"name":"same","source":"https://example.com/one","revision":"1111111111111111111111111111111111111111"}]}\n' >"${conflict_market}/plugins/a/skill-deps.json"
printf '{"skills":[{"name":"same","source":"https://example.com/two","revision":"2222222222222222222222222222222222222222"}]}\n' >"${conflict_market}/plugins/b/skill-deps.json"
assert_fail "catalog rejects same-name different-identity Skills" \
  bash "${REPO_ROOT}/scripts/install-all.sh" --local "${conflict_market}" --list-only --skip-missing-hosts

# --- list: missing file is no-op ---------------------------------------------
plugin_none="${tmp}/plugin-none"
mkdir -p "${plugin_none}"
got="$(list_plugin_skill_deps "${plugin_none}")"
assert_eq "missing skill-deps is empty" "${got}" ""

# --- list: real marketplace plugin with deps ---------------------------------
if [ -f "${REPO_ROOT}/plugins/work-reporting/skill-deps.json" ]; then
  got="$(list_plugin_skill_deps "${REPO_ROOT}/plugins/work-reporting")"
  if printf '%s\n' "${got}" | grep -q $'^grill-me\t'; then
    pass "list work-reporting includes grill-me"
  else
    fail "list work-reporting missing grill-me (got=${got})"
  fi
else
  fail "work-reporting skill-deps.json missing from repo"
fi

# --- seed without install (synthetic cache) ----------------------------------
cache_home="${tmp}/cache-home"
dest_home="${tmp}/dest-home"
mkdir -p "${cache_home}/.agents/skills/demo-skill" "${cache_home}/.claude/skills"
printf '# demo\n' >"${cache_home}/.agents/skills/demo-skill/SKILL.md"
ln -s ../../.agents/skills/demo-skill "${cache_home}/.claude/skills/demo-skill"
printf '{"version":3,"skills":{}}\n' >"${cache_home}/.agents/.skill-lock.json"

# Pre-create claude settings that must survive seeding.
mkdir -p "${dest_home}/.claude"
printf '{"keep":true}\n' >"${dest_home}/.claude/settings.json"

seed_skill_deps_into_home "${cache_home}" "${dest_home}"
assert_ok "seed writes SKILL.md" test -f "${dest_home}/.agents/skills/demo-skill/SKILL.md"
assert_ok "seed preserves settings.json" grep -q '"keep":true' "${dest_home}/.claude/settings.json"
assert_ok "seed copies claude skill link" test -e "${dest_home}/.claude/skills/demo-skill"

# --- install_plugin_skill_deps no-op / skip ----------------------------------
assert_ok "install no-op without skill-deps.json" \
  install_plugin_skill_deps "${plugin_none}" "${dest_home}" "${tmp}/cache" "claude"

# Host-scoped caches must not let a Codex-only .agents tree satisfy a later
# Claude case, or vice versa.
plugin_empty="${tmp}/plugin-empty"
mkdir -p "${plugin_empty}"
printf '{"skills":[]}\n' >"${plugin_empty}/skill-deps.json"
claude_cache="$(ensure_plugin_skill_deps_cache "${plugin_empty}" "${tmp}/cache-scoped" "claude")"
codex_cache="$(ensure_plugin_skill_deps_cache "${plugin_empty}" "${tmp}/cache-scoped" "codex")"
if [ "${claude_cache}" != "${codex_cache}" ]; then
  pass "skill-deps cache is host scoped"
else
  fail "skill-deps cache aliases Claude and Codex: ${claude_cache}"
fi

assert_ok "container run-case keeps skill cache under writable output" \
  grep -Fq 'SKILL_DEPS_CACHE="${ACCEPT_SKILL_DEPS_CACHE:-${OUT_DIR}/skill-deps-cache}"' \
  "${REPO_ROOT}/scripts/acceptance/lib/run-case.sh"

plugin_bad="${tmp}/plugin-bad"
mkdir -p "${plugin_bad}"
printf '{"skills":[{"name":"x"}]}\n' >"${plugin_bad}/skill-deps.json"
assert_fail "install fails closed on invalid skill-deps" \
  install_plugin_skill_deps "${plugin_bad}" "${dest_home}" "${tmp}/cache-bad" "claude"

ACCEPT_SKIP_SKILL_DEPS=1 assert_ok "ACCEPT_SKIP_SKILL_DEPS skips valid deps" \
  install_plugin_skill_deps "${REPO_ROOT}/plugins/work-reporting" \
  "${tmp}/skip-home" "${tmp}/skip-cache" "claude"
unset ACCEPT_SKIP_SKILL_DEPS

# --- optional network install (real npx skills) ------------------------------
if [ "${ACCEPT_TEST_NETWORK:-0}" = "1" ]; then
  net_plugin="${tmp}/plugin-net"
  net_home="${tmp}/net-home"
  net_cache="${tmp}/net-cache"
  mkdir -p "${net_plugin}" "${net_home}"
  cat >"${net_plugin}/skill-deps.json" <<'EOF'
{
  "skills": [
    {
      "name": "grill-me",
      "source": "https://github.com/mattpocock/skills"
    }
  ]
}
EOF
  if install_plugin_skill_deps "${net_plugin}" "${net_home}" "${net_cache}" "both"; then
    if [ -f "${net_home}/.agents/skills/grill-me/SKILL.md" ]; then
      pass "network install seeds grill-me into isolated HOME"
    else
      fail "network install did not produce grill-me SKILL.md"
    fi
    # Second call should hit cache (fingerprint match) and still seed.
    net_home2="${tmp}/net-home-2"
    mkdir -p "${net_home2}"
    if install_plugin_skill_deps "${net_plugin}" "${net_home2}" "${net_cache}" "both" \
      && [ -f "${net_home2}/.agents/skills/grill-me/SKILL.md" ]; then
      pass "cached skill-deps re-seed works"
    else
      fail "cached skill-deps re-seed failed"
    fi
  else
    fail "network install_plugin_skill_deps failed"
  fi
else
  printf 'SKIP network install (set ACCEPT_TEST_NETWORK=1 to enable)\n'
fi

printf '\n==== skill-deps helper tests: passed=%s failed=%s ====\n' "${passed}" "${failed}"
if [ "${failed}" -ne 0 ]; then
  exit 1
fi
exit 0
