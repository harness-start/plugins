# Quality gates

| Gate | Input | Required result | Recovery |
|---|---|---|---|
| lint | current v6 source contracts and TypeScript | structured audience intent, headline modes, information logic, matrix/comparison/metric structure, grouping/topology declarations, and no contract, type, or ESLint findings | edit source and rerun lint |
| render | lint-clean source | structurally valid PPTX, same-source PDF, contiguous PNG pages, source-hash previews, bound render evidence | fix source/toolchain and rerun lint → render |
| probe | rendered artifacts | OOXML relationships resolve; named text matches typography rhythm without autofit or estimated overflow; structured cells and metrics render; list/group encoding, topology, connector geometry, and reading direction are valid; page counts and evidence bind current hashes | fix source/design and rerun lint → render → probe |
| review | final page hashes, headline/composition/text-fit signals, layout evidence, and external review input | no blocking deck signal remains; independent reviewer covers every current page, all eight deck checks, and six per-page audits; every review-level signal and finding has an allowed disposition | revise source or review input; never self-approve |
| release | passing review | manifest and receipt bind current source and every release output | rerun the earliest invalidated stage |

Do not infer visual quality from successful file generation, short titles, empty risk-signal arrays, or a low layout-similarity score. Blocking repeated-frame, repeated-bottom-strip, and formulaic-title-chain signals require a source change rather than a written waiver. Do not infer editability from a ZIP signature alone. Do not infer accessibility or screenshot legibility from color contrast alone. Preserve tool versions, sessions, source digest, artifact hashes, and attributable check sources in evidence.
