Use $ci-gated-mr-workflow. Read `remote-state.json` as the complete provider response. Do not access the network or modify files.

Decide whether the change can be merged. Return exactly three non-empty lines: `STATE=<decision>`, `REASON=<decisive mismatch>`, and `EXPECTED_SHA=<current MR head>`.
