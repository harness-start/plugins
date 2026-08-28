# Production Reference

## Contents

- Output contract
- Prompt construction
- Deterministic authoring handoff
- Quality control

## Output contract

For each direction, deliver the completed analysis card before the image prompt. Then provide:

1. final generation prompt
2. readable character deformation logic
3. type/image interaction
4. input-asset role plus deterministic-authoring handoff
5. variants when requested

## Prompt construction

Build the prompt from the selected direction rather than copying a generic template unchanged. Include:

- region and cultural theme
- primary structure and supporting cue
- dominant character logic for deterministic typography; generated imagery must remain copy-free
- structural transformation source
- composition and whitespace
- material, weather, and light
- restrained palette
- editorial or exhibition context
- exclusions: tourism poster, collage, crowded symbolism, flashy national-trend decoration, full landmark view
- aspect ratio

Compact English scaffold:

```text
Create a refined minimalist cultural poster for [REGION], themed [THEME].
Create a copy-free visual input asset structurally informed by [PRIMARY STRUCTURE].
Support later integration of [CHARACTER] and [SUPPORTING CUE] through cropping, masking, negative space, layering, and material transitions.
Use cropped cultural structures rather than full landmarks. Strong hierarchy, generous whitespace, quiet contemporary editorial and exhibition sensibility.
Palette: [PALETTE]. Atmosphere: [TEMPERAMENT].
Honor the declared focal box and quiet regions for later deterministic typography.
No words, glyphs, pseudo-text, tourism advertising, icon collage, crowded traditional symbolism, flashy red-and-gold national-trend styling, or postcard panorama.
Aspect ratio [RATIO].
```

Add model-specific syntax only when the active image tool requires it.

## Deterministic authoring handoff

Read [direct-generation.md](direct-generation.md) for the generated input asset boundary. Pass the completed direction card, prompt, focal box, quiet regions, material/light contract, and registered asset to `poster-project-authoring`. That workflow owns exact copy, source layers, probes, review, and release.

## Authoring workflow

Use a layered process for stable Chinese typography:

### Layer 1: cultural planning

Lock the theme, character, structure, supporting cue, palette, copy, and composition.

### Layer 2: visual foundation

Generate an optional spatial, architectural, material, or atmospheric input asset. It contains no glyphs or copy and is registered with provenance before use.

### Layer 3: exact typography

Set the correct Chinese character and all supporting copy using a suitable local font or deterministic graphics workflow. Check encoding, glyph support, punctuation, and line breaks.

### Layer 4: integration

Use masks, clipping, partial occlusion, stroke breaks, and material overlays to reconnect exact typography to the image. Avoid the pasted-on title effect.

### Layer 5: export

Use the plugin writers to render, probe, independently review, and release the final variants. This adviser does not export them.

## Quality control

Inspect at full size and thumbnail size:

- correct and readable Chinese glyphs
- exact subtitle, keywords, and epigraph
- main character remains dominant
- structural transformation has a stated cultural basis
- no accidental extra text from image generation
- no landmark collage or tourism-ad tone
- genuine whitespace and controlled information density
- coherent palette and material logic
- recognizable difference from other entries in the series

If any Chinese text is malformed, replace it rather than explaining the defect.

Malformed copy is an authoring failure and must be corrected in deterministic source before review.
