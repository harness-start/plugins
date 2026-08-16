# Quality gates

| Gate | Input | Required result | Recovery |
|---|---|---|---|
| lint | current source contracts and TypeScript | no contract or ESLint findings | edit source and rerun lint |
| render | lint-clean source | structurally valid PPTX, same-source PDF, contiguous PNG pages, source-hash previews, bound render evidence | fix source/toolchain and rerun lint → render |
| probe | rendered artifacts | OOXML relationships resolved, page counts aligned, design and accessibility evidence bound to current hashes | fix source/design and rerun lint → render → probe |
| review | final page hashes and external review input | independent reviewer covers every current page and dispositions every finding | revise source or review input; never self-approve |
| release | passing review | manifest and receipt bind current source and every release output | rerun the earliest invalidated stage |

Do not infer visual quality from successful file generation. Do not infer editability from a ZIP signature alone. Do not infer accessibility from color contrast alone. Preserve tool versions, sessions, source digest, artifact hashes, and attributable check sources in evidence.
