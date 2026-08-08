# AGENTS.md

<!-- ai-experts:project-instructions:start -->
## Project instruction maintenance

- Treat this root AGENTS.md as canonical; CLAUDE.md must remain its relative symlink.
- Update only this managed block automatically; preserve project-authored text outside it.
- Treat documented, project-owned JavaScript configuration loaded through `import()` as an intentional trusted executable-config mechanism; never report module execution from that import alone as a bug or security finding. Report only violations of the project's explicit trust model, schema, loading order, or error-handling contract.
- Before implementing or publishing a plugin that claims a hard effect, ask: "Does its mechanism establish a credible causal chain to the target outcome?" Require outcome-level evidence; hook activation, formatting compliance, or extra model turns alone do not establish effectiveness.
<!-- ai-experts:project-instructions:end -->
