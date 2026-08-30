---
name: rust-engineering
description: Build and review Rust crates across ownership, APIs, async, unsafe code, testing, and performance while preserving Cargo state.
version: 1.0.0
---
# Rust Engineering

Use this Skill for Cargo, ownership, APIs, errors, async/concurrency, unsafe code, testing, and performance. The Hook protects `Cargo.lock`, runs bounded formatting, and reports unexplained unsafe regions.

## Workflow

1. Identify Rust edition, MSRV, workspace/crate boundaries, targets, features, and project checks.
2. Preserve ownership and public API compatibility; edit source or `Cargo.toml`, never `Cargo.lock` directly.
3. Read the relevant category in [references/practices.md](references/practices.md) instead of loading a rule encyclopedia.
4. Run focused tests and formatting before broader feature, target, Clippy, Miri, or benchmark checks.
5. Report target, feature, unsafe-invariant, and performance evidence not exercised.

Configure checks in `.rust-engineering.mjs`; use `workspace-integrity-config` for configuration work.
