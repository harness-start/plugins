# Quality gates

| Gate | Input | Required result | Recovery |
|---|---|---|---|
| lint | current v4 source contracts and TypeScript | structured audience intent, compact display titles, typed visuals, and no contract or ESLint findings | edit source and rerun lint |
| render | lint-clean source | structurally valid PPTX, same-source PDF, contiguous PNG pages, source-hash previews, bound render evidence | fix source/toolchain and rerun lint → render |
| probe | rendered artifacts | OOXML relationships resolved, named titles match the storyboard, native connector geometry is valid, page counts align, and design/accessibility evidence binds current hashes | fix source/design and rerun lint → render → probe |
| review | final page hashes, layout evidence, and external review input | independent reviewer covers every current page and all five quality dimensions; every finding has evidence and an allowed disposition | revise source or review input; never self-approve |
| release | passing review | manifest and receipt bind current source and every release output | rerun the earliest invalidated stage |

Do not infer visual quality from successful file generation or a low layout-similarity score. Do not infer editability from a ZIP signature alone. Do not infer accessibility from color contrast alone. Preserve tool versions, sessions, source digest, artifact hashes, and attributable check sources in evidence.
