# PptxGenJS boundary for storyboard advice

This adviser does not generate PptxGenJS code. It may describe a visual in carrier terms—text hierarchy, image or diagram region, safe margins, reading order, and accessibility—but project-owned slide modules are created only by the authoring workflow.

For diagram slides, recommend a local, hash-bound, self-contained SVG. The deck owner passes `{ svg, data, fit, takeaway, alt, sha256 }` to the slide module. Slide modules may call `slide.addImage` with the supplied `data`; they must not read a path, fetch a URL, spawn a process, add another slide, or create their own deck.

Dependencies are artifact-local and pinned by `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation init`. Never recommend global package installation.
