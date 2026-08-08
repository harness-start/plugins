# Poster Project Delivery Guard

Guards React/TSX poster projects rendered by Satori and resvg under `artifacts/poster/<poster-id>/`. It verifies ordered variants and layers, role-bound filenames, pure layer ownership, paired source-hash SVG/PNG proofs, protected generated paths, and required release files.

The plugin does not certify visual taste. Review evidence remains artifact-bound and independent from the optional `ui-ux-pro-max` advisor.

工程布局、分层 owner 与 receipt 边界见 [DESIGN.md](DESIGN.md)。生成路径只能由 `scripts/tools/` 下的登记 wrapper 写入；当前提供强制 ESLint 与原子 release writer。

Run offline tests from the marketplace root:

```bash
node --test plugins/poster-project-delivery-guard/tests/*.test.mjs
```
