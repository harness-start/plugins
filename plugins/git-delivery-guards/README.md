# Git Delivery Guards

Target-native Git, GitHub, GitLab, and SVN delivery checks. Fifteen source hooks are consolidated into one PreToolUse entry, one PostToolUse entry, and three rule modules.

Node.js 20+ runs the scripts directly. There is no dependency installation, compilation, bundled SDK, or vendored source tree. Repository state is read only for commit/staging checks. Commit scope honors optional `.ai-experts/commit-boundaries.json` declarations, and a stale `index.lock` is removed only after a five-minute threshold and verification that its recorded PID is not alive.
