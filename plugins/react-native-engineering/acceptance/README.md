# react-native-engineering host acceptance

`01-domain-guard` proves that PreToolUse blocks direct writes to React Native Codegen output. `02-deny-package-lockfile` proves that a React Native package independently owns and protects its JavaScript lockfile while the Web plugin yields that package scope. Both cases run on Claude Code and Codex in Docker and require a real hook signal plus unchanged world state.
