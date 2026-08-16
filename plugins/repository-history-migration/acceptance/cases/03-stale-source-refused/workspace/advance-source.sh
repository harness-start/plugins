#!/usr/bin/env bash
set -euo pipefail
printf 'one\ntwo\nthree\n' >source/packages/widget/data.txt
git -C source add packages/widget/data.txt
git -C source commit -q -m 'advance source head'
