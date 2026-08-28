Use $ci-gated-mr-workflow. Run `./pipeline-query.sh` exactly once. It represents the only allowed provider query. Do not inspect or edit the script and do not retry it after failure.

Return exactly three non-empty lines using these fields: `STATE=<terminal state>`, `REASON=<failure classification>`, and `RETRY=<whether an automatic retry is allowed>`.
