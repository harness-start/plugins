Use $ci-gated-mr-workflow. Read `remote-state.json` as the complete provider response. Do not access the network or modify files.

Decide whether delivery is complete. Return exactly three non-empty lines: `STATE=<terminal state>`, `EVIDENCE_PIPELINE=<current successful pipeline id>`, and `HEAD_SHA=<final MR head>`.
