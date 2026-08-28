# Design system

Define color tokens, one core token, structural roles, and named scenarios—not decorative swatches. Every variant selects a scenario. Every text role declares script families, hierarchy, orientation, alignment, tracking policy, integer pixel size and weight, `lineHeightPx`, `letterSpacingEm`, `maxWidthPx`, `maxLines`, and `scriptPolicy: cjk|latin|mixed`. A mixed role must have both CJK and Latin files for its family and weight in `fontRegistry`; `src/render.ts` builds Satori's font input from that registry. Define safe area, base spacing unit, paragraph gap, contrast pairs, and profile-appropriate information density.

Use one stable focal layer id, a normalized focal box, explicit quiet regions with maximum occupancy, one dominant axis, and a declared mass-to-void range. Declare title/media `depth: title-front|media-front|separate` independently from `mechanism: none|mask|interrupt`. Declare material and lighting as a coherent physical contract. Typography must carry hierarchy without relying on size alone. Supporting copy is exact and useful; generated pseudo-text, decorative QR codes, fake metadata, and placeholder labels are forbidden.

Do not encode meaning by color alone. Do not use remote fonts or runtime URLs. Images remain digest-bound assets; font bytes are pinned through the package lock plus `fontRegistry` file paths.
