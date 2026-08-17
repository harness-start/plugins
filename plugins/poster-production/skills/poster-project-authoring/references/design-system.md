# Design system

Define semantic colors, not decorative swatches. Every text role names a font family, integer pixel size and weight, `lineHeightPx`, `letterSpacingEm`, `maxWidthPx`, `maxLines`, `scriptPolicy: cjk|latin|mixed`, and intended use. `fontRegistry` must bind every used family and weight to explicit `.woff`/`.woff2` files in a pinned package; `src/render.ts` must build Satori's font input from that registry. Define safe area, base spacing unit, paragraph gap, contrast pairs, and a maximum information density appropriate to the profile. Re-evaluate CJK, Latin capitals, and mixed-script roles independently; wide Latin display tracking is not a safe Chinese-body default.

Use one focal relationship, one dominant axis, one interruptor, and a declared mass-to-void target range. Declare display letterform type class, stroke profile, structural gravity, edge finish, scene reference, and `front|behind|mask|interrupt|separate` title/media relation. Typography must carry hierarchy without relying on size alone. Supporting copy is exact and useful; generated pseudo-text, decorative QR codes, fake metadata, and placeholder labels are forbidden.

Do not encode meaning by color alone. Do not use remote fonts or runtime URLs. Images remain digest-bound assets; font bytes are pinned through the package lock plus `fontRegistry` file paths.
