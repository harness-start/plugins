---
name: poster-regional-culture
description: Advise on cultural research and art direction for Chinese regional posters, producing candidate directions, prompt packages, and asset briefs.
---

# Regional Culture Poster

This Skill is a **read-only** adviser. It cannot write project files, run bundled scripts, call external APIs or keys, stamp review, or release.

Turn a place into a cultural structure, not a landmark collage. Make one large Chinese character the composition's visual skeleton and connect it to one primary cultural structure, one supporting cue, and a restrained text system.

Preferred baseline: one culturally condensed Chinese character, physically related to a cropped architectural or spatial structure, with strong negative-space tension and sparse exact copy. The adviser describes that relationship; the authoring plugin owns deterministic typography, composition, proofs, and exports.

Anti-rustic calibration: keep the single-character spatial collision, but make it contemporary. Avoid heritage-board, folk-tourism, non-material-culture-promo, ancient-rubbing, dusty-earth, and old-wall nostalgia unless the user explicitly asks for that mood. Prefer abstract construction, cool modern materials, controlled contrast, structural voids, glass/metal/concrete/water/light, and editorial distance.

Text-removal recognition calibration: the poster must not rely on the printed city name to carry the region. If the city label, theme line, and keywords were covered, the image should still contain at least one culturally specific and visually legible mechanism that points to the place: a distinctive building typology, craft process, climate behavior, street-life pattern, material system, water/terrain condition, ritual order, food/tool/workshop logic, or historical spatial structure. Generic modern materials such as glass, concrete, bridge, skyline, water reflection, and fog may support the design but cannot be the primary cultural evidence by themselves.

Two-mode calibration:

- **MODE A / structural character poster**: the Chinese character is the main visual body. City structures grow into the glyph through masking, negative space, material transition, and spatial cuts. Use this when the user wants 大字、造字、城市字体、字形实验、一个主字、直接图像生成, or the current single-character series direction.
- **MODE B / regional editorial poster**: the city image is the main subject, and the city name is an editorial anchor rather than the whole image container. Use this when the user wants stronger editorial feeling, richer text hierarchy, cultural research poster, magazine-like city poster, clearer cultural explanation, or says the big-character masking approach is too forced, too empty, too illegible, or too dependent on one huge glyph. Read [mode-b-editorial.md](references/mode-b-editorial.md) before planning or rendering MODE B.

## Route the request

Determine the requested stopping point:

1. **Strategy only**: deliver candidate research, direction selection, and the analysis card.
2. **Prompt package**: deliver strategy plus production-ready image prompts and typography directions.
3. **Input-asset brief**: describe a text-free or copy-free visual asset that may be generated elsewhere, then register that result as a digest-bound input asset for deterministic authoring.
4. **Batch series**: plan all regions first and run global deduplication before handing directions to the authoring workflow.

This adviser never renders images or mutates a poster project. When the user asks for an artifact, hand the selected direction and any generated input asset to `poster-project-authoring`.

## Establish inputs

Use supplied constraints. Otherwise apply these defaults:

- region: required; infer whether it is administrative, historical, or cultural
- count: `1`
- aspect ratio: `3:4`
- language: Chinese
- style: restrained, high-design, contemporary, quiet, editorial, exhibition-like; avoid commercial poster, movie-poster, tourism campaign, and decorative premium looks by default
- modern/traditional layering: allowed when culturally defensible
- supporting English: optional and subordinate
- sentence and 3-5 keywords: included unless the user asks for a text-free image
- production handoff: deterministic authoring; generated imagery is an optional input asset, never the final layout
- visual mode: infer MODE A or MODE B from the user's taste feedback; default to MODE A for “城市字体 / 大字 / 造字”, and MODE B for “编辑感 / 杂志感 / 城市文化研究 / 图文丰富 / 不要只有大字”

For missing noncritical details, proceed with defaults. Ask only when the region itself is ambiguous enough to materially change the result.

## Follow the workflow

### 1. Build the cultural candidate pool

Analyze at least these seven dimensions before composing:

- geography and climate
- architectural structures
- materials and local color
- historical and literary context
- everyday life and craft
- contemporary urban conditions
- spiritual temperament

Read [cultural-analysis.md](references/cultural-analysis.md) for the candidate vocabulary, selection rubric, and anti-stereotype rules.

### 2. Generate and select directions

Generate 3-5 internally coherent directions. Score them on:

- regional specificity
- cultural recognizability
- visual translatability
- potential to merge with character structure
- avoidance of cliche
- differentiation within the series
- text-removal recognizability: whether the place still has cultural evidence after covering the city name and explanatory copy

Select exactly one primary cultural structure, one supporting cue, and one temperament. Name the direction as `地区｜本次文化主题`.

### 3. Choose and transform the main character

Prefer, in order:

1. one culturally condensed character, such as 京、粤、闽、蜀、秦、沪、苏、滇、藏
2. a short historical or cultural name, such as 北平、岭南、巴蜀、江南、三秦
3. the full place name only when shorter choices are misleading

Keep the character readable. Derive every deformation from evidence such as roof pitch, gable line, gate void, alley path, water curve, mountain contour, courtyard order, arcade rhythm, wall boundary, or old/new urban layering. Never decorate the character without a cultural source.

### 4. Define the visual system

Use:

- one dominant character as the visual body
- one primary cultural structure
- one supporting cultural cue
- generous real whitespace
- one dominant color, one or two supporting colors, and one neutral
- cropped structures, material interfaces, paths, edges, silhouettes, and light
- masking, negative space, interruption, layering, or partial occlusion between image and type
- exhibition-key-visual logic: abstract spatial section, material cut, wall aperture, threshold, compression, void, or civic infrastructure fragment may carry the idea more effectively than a recognizable building face
- one non-substitutable local mechanism: choose one thing that would be difficult to swap into another city without becoming false, such as Beijing palace-wall axis, Guangzhou arcade-river humidity, Nanjing plane-tree city-wall aperture, Shanghai lane-house stone-gate compression, Foshan ceramic kiln/workshop frame, Chongqing stair-bridge cliff section, Harbin ice-brick winter street, Suzhou garden-window water borrowing, or Quanzhou maritime temple/arcade layering
- prefer one culturally condensed dominant character when it can remain broadly readable and conceptually stronger than the full place name; use the full place name as the dominant typography only when the single-character route becomes misleading, generic, or unreadable
- if choosing the full place name, keep it independent, exact, and immediately readable, then put creativity into space, material, light, cropping, and image logic; do not let this fallback make the poster safe or ordinary
- controlled custom typography as the main enrichment layer: adjust stroke weight, serif shape, counters, rhythm, cuts, terminals, alignment, spacing, and material edge behavior according to the place; enrich the title before adding extra imagery
- a clean structure may still feel designed when the title has a deliberate type system, such as stone-cut Song style, slab-like civic gothic, porcelain-blue serif, wall-painted sans, weathered inscription edge, or narrow vertical title stack
- contemporary anti-rustic material logic: cold grey, fog white, deep green-black, glass reflection, brushed metal, wet concrete, polished stone, abstract water plane, shadow cuts, and restrained neon/sodium accents may replace ochre wall, ancient paper, dust, old brick, heavy rubbing, and faux-historical texture

Avoid:

- full landmark views and postcard compositions
- tourism advertising, slogans, or check-in imagery
- icon collages and unrelated traditional patterns
- movie-poster drama, commercial campaign polish, centered heroic building facades, cinematic spectacle, and over-produced atmosphere that makes the work feel generic
- heritage-tourism poster mood, non-material-culture promo texture, faux-ancient rubbing, dusty ochre nostalgia, old-wall-only backgrounds, heavy stone inscription aesthetics, and generic museum souvenir styling
- making the main title hard to read in pursuit of clever character-architecture fusion
- solving emptiness by adding decorative motifs, symbols, extra props, or busy background detail when typography could carry the richness
- overcorrecting readability into ordinary full-name title posters, plain wall compositions, or safe typographic layouts with no strong cultural mechanism
- making the culture so abstract that, after covering the text, the image becomes a generic modern poster for any city
- using generic urban ingredients such as glass curtain wall, bridge, water, fog, skyline, concrete, neon, or reflective floor as the main cultural idea without a place-specific structure attached
- making a poster feel “traditional” by default through earth yellow, sepia, cracked plaster, rubbing texture, seal-like composition, or antique typography
- red-and-gold national-trend styling by default
- calligraphy plus seal as a generic shortcut for “Eastern”
- dense explanatory copy, cartoon rendering, and fixed templates that only swap names

Read [visual-system.md](references/visual-system.md) before writing the final art direction or rendering.

For MODE B, read [mode-b-editorial.md](references/mode-b-editorial.md) and follow its city-image-first workflow. MODE B must not silently fall back to the giant-character mask system.

### 5. Output the planning layer

Always present a compact candidate pool and 3-5 direction options, then emit this completed card:

```markdown
### 地区文化分析卡
**地区：**
**本次主题：**
**主大字：**
**主文化结构：**
**辅助文化元素：**
**精神气质：**
**色彩建议：**
**构图建议：**
**关键词：**
**一句短句：**
**大字变形逻辑：**
**应避免内容：**
```

Keep the sentence poetic and concrete, not promotional or didactic.

### 6. Produce prompts or an input-asset brief

For prompt packages, output:

1. final image-generation prompt
2. character-transformation logic
3. image/type relationship
4. deterministic-authoring handoff, including focal box, quiet regions, material, light, and asset role
5. A/B/C variants when multiple directions are requested

Read [production.md](references/production.md) for prompt construction and [direct-generation.md](references/direct-generation.md) for the generated-input-asset boundary. Do not put exact display copy, final typography, or the complete layout into a generated asset. Register every accepted generated image in `plan.assets.json` with its tool, model, prompt digest, and content digest before authoring uses it.

### 7. Validate before delivery

Reject and revise results that fail any of these gates:

- The place is recognizable through cultural structure rather than a landmark inventory.
- Text-removal gate: if the city name, theme, and keywords are mentally covered, at least one visible structure, material, climate, craft, street-life, terrain, or spatial mechanism still points to the region. If not, revise before delivery.
- The main character is correct, readable, dominant, and transformed for a stated reason.
- When the full place name is the main title, every character is correct, independent enough to read instantly, and not dissolved into architecture, shadow, or texture.
- Every required glyph and copy line remains deterministic, exact, and independently reviewable.
- The image feels like an exhibition key visual, art-book cover, or cultural research poster, not a movie poster, tourism campaign, commercial KV, or souvenir advertisement.
- The design has one center, strong hierarchy, and genuine whitespace.
- Clean compositions still contain a considered typography design: the dominant title has intentional stroke rhythm, spacing, edge treatment, or material logic rather than default unmodified text.
- Color, material, and atmosphere come from the place rather than decoration.
- The work feels contemporary rather than rustic: if the concept uses historical material, balance it with modern cropping, cool palette, abstraction, or spatial tension so it does not become a heritage-tourism board.
- The sentence reads like an exhibition epigraph, not tourism copy.
- The work avoids cliche national-trend styling and generic city-poster composition.
- A series entry differs from prior entries in structure, character logic, palette, or composition.
- The delivered poster comes only from the deterministic authoring and evidence workflow; generated imagery remains an input asset.

For batch work, read [series-and-examples.md](references/series-and-examples.md) and perform a global deduplication pass before rendering.
