# Logo Project Delivery Guard

Guards LOGO-only projects under `artifacts/logo/<logo-id>/`. It verifies concept previews, Mark/Wordmark/Lockup vector ownership, self-contained master SVG, standard-grid and geometry inputs, required Fibonacci construction mappings, protected generated paths, and variant closure.

The Fibonacci check proves a reproducible relationship to the master; it does not claim that golden-ratio construction makes a logo aesthetically good or legally registrable.

标准制图、几何/Fibonacci 映射、变体闭包与 receipt 边界见 [DESIGN.md](DESIGN.md)。

```bash
node --test plugins/logo-project-delivery-guard/tests/*.test.mjs
```
