# Print Publication Delivery Guard

Guards print manuals, catalogs, and magazine-style publications under `artifacts/print/<publication-id>/`. It verifies strictly increasing section manifests, static React publication units, cover roles, Paged Media CSS, protected HTML/PDF/page writers, four proof/print PDF roles, and preflight evidence.

It does not treat PDF/X naming as evidence. Release validation checks PDF magic and requires explicit preflight and review artifacts.

静态出版单元、四类 PDF、preflight 证据与 receipt 边界见 [DESIGN.md](DESIGN.md)。

```bash
node --test plugins/print-publication-delivery-guard/tests/*.test.mjs
```
