#!/usr/bin/env bash
# Offline checks for acceptance skill-deps helpers.
# Usage:
#   bash scripts/acceptance/test-skill-deps-install.sh
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
valid_json='{"skills":[{"name":"grilling","source":"https://github.com/mattpocock/skills"}]}'
got="$(parse_skill_deps_json "${valid_json}" "valid.json")"
assert_eq "parse valid name/source" "${got}" $'grilling\thttps://github.com/mattpocock/skills'

assert_fail "reject revision pin" parse_skill_deps_json '{"skills":[{"name":"grilling","source":"https://github.com/mattpocock/skills","revision":"068b6e0c62393147daf03530149cdce209c93da8"}]}' "pinned.json"
assert_fail "reject legacy subpath selector" parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo","subpath":"skills/x"}]}' "subpath.json"
assert_fail "reject unapproved executable" parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo","mode":"audited-executable","execution":{"approved":false,"paths":[{"path":"scripts/x.py","sha256":"0123456789012345678901234567890123456789012345678901234567890123"}]}}]}' "unapproved-executable.json"
assert_fail "reject escaping skill subpath" \
  parse_skill_deps_json '{"skills":[{"name":"x","source":"https://example.com/repo","subpath":"../x"}]}' "invalid-subpath.json"
assert_ok "installer does not run Git for community Skills" \
  sh -c '! grep -Eq "git (clone|fetch|checkout)" "$1"' sh "${REPO_ROOT}/scripts/install-all.sh"
assert_ok "acceptance helper does not run Git for community Skills" \
  sh -c '! grep -Eq "git (clone|fetch|checkout)" "$1"' sh "${REPO_ROOT}/scripts/acceptance/lib/common.sh"
assert_ok "vendor updater exists and is executable" \
  test -x "${REPO_ROOT}/scripts/update-vendor-skills.sh"
assert_ok "installer declares vendor-only Skill installation" \
  grep -Fq 'vendor-skills' "${REPO_ROOT}/scripts/install-all.sh"
assert_ok "installer verifies the prepared vendor index before installation" \
  grep -Fq 'node "${verifier}" verify' "${REPO_ROOT}/scripts/install-all.sh"

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
printf '{"skills":[{"name":"same","source":"https://example.com/one"}]}\n' >"${conflict_market}/plugins/a/skill-deps.json"
printf '{"skills":[{"name":"same","source":"https://example.com/two"}]}\n' >"${conflict_market}/plugins/b/skill-deps.json"
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
  if printf '%s\n' "${got}" | grep -q $'^grilling\t'; then
    pass "list work-reporting includes grilling"
  else
    fail "list work-reporting missing grilling (got=${got})"
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

# --- install source: local vendor only ---------------------------------------
vendor_root="${tmp}/vendor-market/vendor-skills"
vendor_home="${tmp}/vendor-home"
fake_bin="${tmp}/fake-bin"
fake_npx_log="${tmp}/fake-npx.log"
mkdir -p "${vendor_root}/demo-skill" "${vendor_home}" "${fake_bin}"
printf '%s\n' '---' 'name: demo-skill' 'description: synthetic test skill' '---' '# Demo' \
  >"${vendor_root}/demo-skill/SKILL.md"
printf '{"schemaVersion":1,"skills":[{"name":"demo-skill","source":"https://example.com/upstream"}]}\n' \
  >"${vendor_root}/index.json"
cat >"${fake_bin}/npx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >"${FAKE_NPX_LOG}"
source_path=""
skill_name=""
previous=""
for arg in "$@"; do
  if [ "${previous}" = "add" ] && [ -z "${source_path}" ]; then source_path="${arg}"; fi
  if [ "${previous}" = "--skill" ] && [ -z "${skill_name}" ]; then skill_name="${arg}"; fi
  previous="${arg}"
done
mkdir -p "${HOME}/.agents/skills/${skill_name}" "${HOME}/.claude/skills/${skill_name}"
if [ -f "${source_path}/${skill_name}/SKILL.md" ]; then
  cp "${source_path}/${skill_name}/SKILL.md" "${HOME}/.agents/skills/${skill_name}/SKILL.md"
  cp "${source_path}/${skill_name}/SKILL.md" "${HOME}/.claude/skills/${skill_name}/SKILL.md"
else
  printf '%s\n' '---' "name: ${skill_name}" 'description: synthetic acquired skill' '---' '# Demo' \
    >"${HOME}/.agents/skills/${skill_name}/SKILL.md"
  cp "${HOME}/.agents/skills/${skill_name}/SKILL.md" "${HOME}/.claude/skills/${skill_name}/SKILL.md"
fi
EOF
chmod +x "${fake_bin}/npx"

update_root="${tmp}/update-market"
mkdir -p "${update_root}/.claude-plugin" "${update_root}/plugins/demo"
printf '{"plugins":[]}\n' >"${update_root}/.claude-plugin/marketplace.json"
printf '{"skills":[{"name":"demo-skill","source":"https://example.com/upstream"}]}\n' \
  >"${update_root}/plugins/demo/skill-deps.json"
assert_ok "vendor updater acquires declared Skills and writes an index" \
  env PATH="${fake_bin}:${PATH}" FAKE_NPX_LOG="${fake_npx_log}" \
    bash "${REPO_ROOT}/scripts/update-vendor-skills.sh" --root "${update_root}"
assert_ok "vendor updater writes acquired SKILL.md" \
  test -f "${update_root}/vendor-skills/demo-skill/SKILL.md"
assert_ok "vendor updater index records declared identity" \
  jq -e '.schemaVersion == 1 and (.skills | length == 1) and .skills[0].name == "demo-skill" and .skills[0].source == "https://example.com/upstream"' \
    "${update_root}/vendor-skills/index.json"
assert_ok "vendor updater index verifies against content" \
  node "${REPO_ROOT}/scripts/vendor-skills-index.mjs" verify --root "${update_root}"
printf '\nTampered\n' >>"${update_root}/vendor-skills/demo-skill/SKILL.md"
assert_fail "vendor index verification rejects content drift" \
  node "${REPO_ROOT}/scripts/vendor-skills-index.mjs" verify --root "${update_root}"

assert_ok "acceptance installs a declared Skill from local vendor" \
  env PATH="${fake_bin}:${PATH}" HOME="${vendor_home}" FAKE_NPX_LOG="${fake_npx_log}" \
    ACCEPT_VENDOR_SKILLS_DIR="${vendor_root}" \
    bash -c '. "$1"; install_skill_into_home "demo-skill" "https://example.com/upstream" "both"' \
    bash "${REPO_ROOT}/scripts/acceptance/lib/common.sh"
if [ -f "${fake_npx_log}" ]; then
  got="$(sed -n '4p' "${fake_npx_log}")"
else
  got=""
fi
assert_eq "acceptance passes vendor root to skills CLI" "${got}" "${vendor_root}"

ACCEPT_SKIP_SKILL_DEPS=1 assert_ok "ACCEPT_SKIP_SKILL_DEPS skips valid deps" \
  install_plugin_skill_deps "${REPO_ROOT}/plugins/work-reporting" \
  "${tmp}/skip-home" "${tmp}/skip-cache" "claude"
unset ACCEPT_SKIP_SKILL_DEPS

printf '\n==== skill-deps helper tests: passed=%s failed=%s ====\n' "${passed}" "${failed}"
if [ "${failed}" -ne 0 ]; then
  exit 1
fi
exit 0
