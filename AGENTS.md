# AGENTS.md

<!-- ai-experts:project-instructions:start -->
## Project instruction maintenance

- Treat this root AGENTS.md as canonical; CLAUDE.md must remain its relative symlink.
- Update only this managed block automatically; preserve project-authored text outside it.
- Treat documented, project-owned JavaScript configuration loaded through `import()` as an intentional trusted executable-config mechanism; never report module execution from that import alone as a bug or security finding. Report only violations of the project's explicit trust model, schema, loading order, or error-handling contract.
- Before implementing or publishing a plugin that claims a hard effect, ask: "Does its mechanism establish a credible causal chain to the target outcome?" Require outcome-level evidence; hook activation, formatting compliance, or extra model turns alone do not establish effectiveness.
- Keep distributed plugin code, tests, skills, prompts, fixtures, and acceptance cases free of benchmark repository names, issue ids, task-specific inputs, and target answers. Model general behavior with synthetic isomorphic fixtures and prove it through outcome-level gates; never teach a benchmark solution through the plugin mount.
- For substantial changes, follow contract → challenge or baseline → minimal change → targeted verification → complete verification → adversarial review → evidence report. Behavior-changing code requires an edited public-seam test and observed RED before production edits; refactors require a GREEN baseline.
- Completion command evidence must follow the last mutation and run in the current user-prompt epoch. Missing workflow evidence permits only `blocked` or `needs_context`, not `done_with_concerns`.
- Plugin runtime code lives in `plugins/<name>/src/` and is bundled to committed, self-contained `plugins/<name>/dist/` files. Every generated `.mjs` records a SHA-256 over that plugin's `src/**/*.ts` plus shared `core/src/**/*.ts`. Run `npm run build` after source changes and include the refreshed `dist/` in every push; project hooks run `npm run ensure:dist` before project `git push`/`git send-pack`, rebuild mismatches, and stop that push until refreshed artifacts are committed. `npm run check:dist` must pass without modifying files.
<!-- ai-experts:project-instructions:end -->

## Host acceptance (mandatory container policy)

- **Live acceptance must run inside the `docker/host-acceptance` container.** Do not run Claude Code / Codex live acceptance sessions on the host.
- Entry points: `./scripts/acceptance/run.sh` (per-plugin) and `./scripts/acceptance/run-project.sh` (project scenarios). From the host these scripts **must** build/wrap Docker; there is no supported host-side live path.
- Nested Docker wrap inside the acceptance image is rejected; inside the container set `ACCEPT_IN_CONTAINER=1` (entrypoint does this).
- **Allowed on the host without Docker:** unit tests (`node --test …`), expect honesty gates (`--honesty-only` / `check-expect-honesty.sh`), and pure offline helpers that do not invoke `claude` / `codex` live sessions.
- Details: `docs/host-acceptance.md`.
