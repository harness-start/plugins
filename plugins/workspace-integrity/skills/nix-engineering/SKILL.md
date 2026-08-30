---
name: nix-engineering
description: Build and review Nix, flakes, NixOS, and Home Manager changes while preserving lockfile ownership and reproducibility.
version: 1.0.0
---
# Nix Engineering

Use this Skill for Nix language, flakes, NixOS, Home Manager, and reproducible development environments. The Hook protects `flake.lock` and performs bounded parsing when tools exist.

## Workflow

1. Identify flake boundaries, inputs, target systems, overlays, and repository-owned checks.
2. Edit Nix declarations, never `flake.lock` directly; use Nix commands for dependency updates.
3. Read [references/practices.md](references/practices.md) for evaluation and reproducibility guidance.
4. Run the narrowest parse/evaluation check, then required build or VM/system acceptance.
5. Report unavailable platforms, substituters, secrets, or deployment evidence.

Configure checks in `.nix-engineering.mjs`; use `workspace-integrity-config` for configuration work.
