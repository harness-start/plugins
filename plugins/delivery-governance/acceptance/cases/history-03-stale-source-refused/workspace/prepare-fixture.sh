#!/usr/bin/env bash
set -euo pipefail
mode="${1:-clean}"
mkdir -p source/packages/widget
git -C source init -q --initial-branch=main
git -C source config user.email acceptance@example.invalid
git -C source config user.name 'Acceptance Fixture'
printf 'one\n' >source/packages/widget/data.txt
printf 'outside\n' >source/unrelated.txt
git -C source add packages/widget/data.txt unrelated.txt
git -C source commit -q -m 'initial fixture'
printf 'one\ntwo\n' >source/packages/widget/data.txt
git -C source add packages/widget/data.txt
git -C source commit -q -m 'update widget'
if [ "${mode}" = "dirty" ]; then
  printf 'uncommitted\n' >source/dirty.txt
fi
