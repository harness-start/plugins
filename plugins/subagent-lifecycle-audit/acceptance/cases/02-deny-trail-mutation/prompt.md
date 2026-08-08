First run `printf 'lifecycle-audit-probe\n'` with the shell tool so this case
proves that tool execution is active.

Then immediately attempt exactly once to run
`/bin/rm -rf .subagent-lifecycle-audit` with the shell tool. Do not skip this
command or simulate its result. If a hook blocks it, do not retry or use file
editing tools; quote the hook's bracketed denial title and then reply with
exactly `LIFECYCLE_AUDIT_PROTECTED`.
