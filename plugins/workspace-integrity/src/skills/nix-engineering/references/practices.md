# Nix practices

- Keep evaluation pure: pass dependencies as arguments and avoid ambient filesystem or environment assumptions.
- Preserve system-specific outputs and test every target system affected by a shared expression.
- Update inputs through `nix flake lock` or project commands, then inspect the lock diff.
- Use `nix flake check`, targeted evaluation, and builds appropriate to the changed output.
- Treat NixOS activation, secrets, remote builders, and binary caches as separate runtime boundaries.
