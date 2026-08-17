#!/usr/bin/env bash
# Refresh every external Skill declared by plugins/*/skill-deps.json and publish
# a deterministic, self-contained vendor-skills/ tree for consumer installs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
JOBS="${VENDOR_SKILLS_JOBS:-4}"

usage() {
  cat <<'EOF'
Usage: update-vendor-skills.sh [--root <repo>] [--jobs <count>]

Download the current upstream version of every external Skill declared in
plugins/*/skill-deps.json, then atomically replace vendor-skills/ and regenerate
vendor-skills/index.json. This is the only workflow that contacts Skill sources;
consumer installation reads the prepared vendor tree.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      ROOT_DIR="$(cd "${2:?--root requires a path}" && pwd)"
      shift 2
      ;;
    --jobs)
      JOBS="${2:?--jobs requires a value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${JOBS}" in
  ''|*[!0-9]*|0)
    printf 'error: --jobs must be a positive integer\n' >&2
    exit 2
    ;;
esac

for command in jq node npx; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'error: %s is required\n' "${command}" >&2
    exit 1
  fi
done

download_file() {
  local url="$1"
  local destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 --connect-timeout 15 --max-time 180 -o "${destination}" "${url}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=180 -O "${destination}" "${url}"
  else
    printf 'error: curl or wget is required to download GitHub tree sources\n' >&2
    return 1
  fi
}

if [ ! -d "${ROOT_DIR}/plugins" ] || [ ! -f "${ROOT_DIR}/.claude-plugin/marketplace.json" ]; then
  printf 'error: not a Harness Start plugin repository: %s\n' "${ROOT_DIR}" >&2
  exit 1
fi

vendor_target="${ROOT_DIR}/vendor-skills"
if [ -L "${vendor_target}" ]; then
  printf 'error: refusing to replace symlinked vendor target: %s\n' "${vendor_target}" >&2
  exit 1
fi

workspace="$(mktemp -d "${ROOT_DIR}/.vendor-skills-update.XXXXXX")"
active_pids=()
cleanup() {
  local pid
  for pid in "${active_pids[@]:-}"; do
    [ -n "${pid}" ] || continue
    kill "${pid}" 2>/dev/null || true
  done
  rm -rf -- "${workspace}"
}
trap cleanup EXIT HUP INT TERM

rows_file="${workspace}/skills.tsv"
staging="${workspace}/vendor-skills"
mkdir -p "${staging}" "${workspace}/sources"

for manifest in "${ROOT_DIR}"/plugins/*/skill-deps.json; do
  [ -f "${manifest}" ] || continue
  jq -er '
    if type != "object" or (.skills | type) != "array" then
      error("root must contain a skills array")
    else
      .skills[]
      | if (.name | type) != "string" or (.name | test("^[A-Za-z0-9._-]+$") | not)
           or (.source | type) != "string" or (.source | startswith("https://") | not)
        then error("every skill needs a safe name and HTTPS source")
        else [.name, .source, (.allowFiles // null | tojson)] | @tsv
        end
    end
  ' "${manifest}" >>"${rows_file}"
done

if [ ! -s "${rows_file}" ]; then
  printf 'error: no external Skills are declared under %s/plugins\n' "${ROOT_DIR}" >&2
  exit 1
fi

LC_ALL=C sort -u "${rows_file}" -o "${rows_file}"
conflicts="$(awk -F '\t' '
  ($1 in source_by_name) && source_by_name[$1] != $2 { conflict[$1] = 1 }
  ($1 in allow_by_name) && allow_by_name[$1] != $3 { conflict[$1] = 1 }
  !($1 in source_by_name) { source_by_name[$1] = $2 }
  !($1 in allow_by_name) { allow_by_name[$1] = $3 }
  END { for (name in conflict) print name }
' "${rows_file}" | LC_ALL=C sort)"
if [ -n "${conflicts}" ]; then
  printf 'error: Skill names resolve to multiple upstream sources:\n%s\n' "${conflicts}" >&2
  exit 1
fi

sources=()
while IFS= read -r source; do
  [ -n "${source}" ] || continue
  sources+=("${source}")
done < <(cut -f2 "${rows_file}" | LC_ALL=C sort -u)
printf '==> Refreshing %s external Skill(s) from %s source repository/repositories\n' \
  "$(wc -l <"${rows_file}" | tr -d ' ')" "${#sources[@]}"

active_labels=()
active_logs=()

acquire_source() {
  local source_index="$1"
  local source="$2"
  shift 2
  local -a names=("$@")
  local source_home="${workspace}/sources/${source_index}/home"
  local source_log="${workspace}/sources/${source_index}/install.log"
  local name installed attempt installed_ok=0 allow_json allowed_path raw_base
  mkdir -p "${source_home}"
  if [[ "${source}" == https://github.com/*/tree/* ]]; then
    if [ "${#names[@]}" -ne 1 ]; then
      printf 'error: a GitHub tree source must identify exactly one Skill: %s\n' "${source}" >>"${source_log}"
      return 1
    fi
    name="${names[0]}"
    allow_json="$(awk -F '\t' -v name="${name}" -v source="${source}" \
      '$1 == name && $2 == source { print $3; exit }' "${rows_file}")"
    if [ -z "${allow_json}" ] || [ "${allow_json}" = "null" ]; then
      printf 'error: GitHub tree sources require allowFiles: %s\n' "${source}" >>"${source_log}"
      return 1
    fi
    if [[ "${source}" =~ ^https://github.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)$ ]]; then
      raw_base="https://raw.githubusercontent.com/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}/${BASH_REMATCH[3]}/${BASH_REMATCH[4]}"
    else
      printf 'error: malformed GitHub tree source: %s\n' "${source}" >>"${source_log}"
      return 1
    fi
    installed="${source_home}/.agents/skills/${name}"
    mkdir -p "${installed}"
    installed_ok=1
    while IFS= read -r allowed_path; do
      [ -n "${allowed_path}" ] || continue
      mkdir -p "${installed}/$(dirname "${allowed_path}")"
      if ! download_file "${raw_base}/${allowed_path}" "${installed}/${allowed_path}" >>"${source_log}" 2>&1; then
        installed_ok=0
        break
      fi
    done < <(printf '%s' "${allow_json}" | jq -r '.[]')
  else
    for attempt in 1 2 3; do
      if (
        export HOME="${source_home}"
        export npm_config_cache="${source_home}/.npm"
        npx --yes skills add "${source}" --skill "${names[@]}" --global --yes -a codex --copy
      ) >>"${source_log}" 2>&1; then
        installed_ok=1
        break
      fi
      printf 'warning: attempt %s/3 failed for %s\n' "${attempt}" "${source}" >>"${source_log}"
    done
  fi
  if [ "${installed_ok}" -ne 1 ]; then return 1; fi
  for name in "${names[@]}"; do
    installed="${source_home}/.agents/skills/${name}"
    if [ ! -f "${installed}/SKILL.md" ]; then
      printf 'error: Skill installer did not produce %s/SKILL.md\n' "${installed}" >>"${source_log}"
      return 1
    fi
    cp -R "${installed}" "${staging}/${name}"
  done
}

wait_batch() {
  local index failed=0
  for index in "${!active_pids[@]}"; do
    if wait "${active_pids[${index}]}"; then
      printf '==> Ready: %s\n' "${active_labels[${index}]}"
    else
      printf 'error: failed to refresh %s\n' "${active_labels[${index}]}" >&2
      sed -n '1,240p' "${active_logs[${index}]}" >&2
      failed=1
    fi
  done
  active_pids=()
  active_labels=()
  active_logs=()
  return "${failed}"
}

source_index=0
for source in "${sources[@]}"; do
  names=()
  while IFS= read -r name; do
    [ -n "${name}" ] || continue
    names+=("${name}")
  done < <(awk -F '\t' -v source="${source}" '$2 == source { print $1 }' "${rows_file}")
  source_index=$((source_index + 1))
  printf '==> Start [%s/%s]: %s (%s)\n' \
    "${source_index}" "${#sources[@]}" "${source}" "${names[*]}"
  acquire_source "${source_index}" "${source}" "${names[@]}" &
  active_pids+=("$!")
  active_labels+=("${source} (${names[*]})")
  active_logs+=("${workspace}/sources/${source_index}/install.log")
  if [ "${#active_pids[@]}" -ge "${JOBS}" ]; then
    wait_batch || exit 1
  fi
done
if [ "${#active_pids[@]}" -gt 0 ]; then wait_batch || exit 1; fi

# Keep only explicitly audited runtime files when allowFiles is declared. A
# missing allowlisted path is a hard failure because it signals upstream drift.
while IFS=$'\t' read -r name _source allow_json; do
  [ "${allow_json}" != "null" ] || continue
  filtered="${workspace}/filtered/${name}"
  mkdir -p "${filtered}"
  while IFS= read -r allowed_path; do
    [ -n "${allowed_path}" ] || continue
    if [ ! -e "${staging}/${name}/${allowed_path}" ]; then
      printf 'error: allowlisted vendor path is missing for %s: %s\n' \
        "${name}" "${allowed_path}" >&2
      exit 1
    fi
    mkdir -p "${filtered}/$(dirname "${allowed_path}")"
    cp -R "${staging}/${name}/${allowed_path}" "${filtered}/${allowed_path}"
  done < <(printf '%s' "${allow_json}" | jq -r '.[]')
  rm -rf -- "${staging}/${name}"
  mv -- "${filtered}" "${staging}/${name}"
done <"${rows_file}"

node "${SCRIPT_DIR}/vendor-skills-index.mjs" write \
  --root "${ROOT_DIR}" \
  --vendor "${staging}"

backup="${workspace}/previous-vendor-skills"
if [ -e "${vendor_target}" ]; then
  mv -- "${vendor_target}" "${backup}"
fi
if ! mv -- "${staging}" "${vendor_target}"; then
  if [ -e "${backup}" ]; then mv -- "${backup}" "${vendor_target}"; fi
  exit 1
fi
rm -rf -- "${backup}"

printf '==> Updated %s\n' "${vendor_target}"
