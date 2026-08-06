# Infrastructure and DevOps Guards

Target-native JavaScript checks for irreversible infrastructure commands, bounded network probes, PVE and StatefulSet storage safety, production kubectl changes, Terraform/OpenTofu plan evidence and lockfiles, encoding, shell syntax, Dockerfile/YAML basics, and IaC debt markers. When already present on the host, `actionlint`, `kubeconform`, `terraform`, `shellcheck`, and `hadolint` provide deeper reports. Node.js 20 runs the scripts directly with no dependency installation or compilation.

The 16 source hooks are consolidated into one PreToolUse entry, one PostToolUse entry, and three rule modules. Optional external linters are never installed by the plugin.
