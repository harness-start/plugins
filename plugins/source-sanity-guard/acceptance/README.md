# source-sanity-guard acceptance

The case runs on Claude Code and Codex in the Docker host-acceptance harness. It requires a real PreToolUse guard signal and verifies that the requested backup artifact was never created. File tools and shell commands that write an explicit backup path are both in scope.
