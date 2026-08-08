# AGENTS.md

<!-- ai-experts:project-instructions:start -->
## Project instruction maintenance

- Treat this root AGENTS.md as canonical; CLAUDE.md must remain its relative symlink.
- Update only this managed block automatically; preserve project-authored text outside it.
- Treat documented, project-owned JavaScript configuration loaded through `import()` as an intentional trusted executable-config mechanism; never report module execution from that import alone as a bug or security finding. Report only violations of the project's explicit trust model, schema, loading order, or error-handling contract.
- Before implementing or publishing a plugin that claims a hard effect, ask: "Does its mechanism establish a credible causal chain to the target outcome?" Require outcome-level evidence; hook activation, formatting compliance, or extra model turns alone do not establish effectiveness.
- For substantial changes, follow contract → challenge or baseline → minimal change → targeted verification → complete verification → adversarial review → evidence report. Behavior-changing code requires an edited public-seam test and observed RED before production edits; refactors require a GREEN baseline.
- Completion command evidence must follow the last mutation and run in the current user-prompt epoch. Missing workflow evidence permits only `blocked` or `needs_context`, not `done_with_concerns`.
<!-- ai-experts:project-instructions:end -->
