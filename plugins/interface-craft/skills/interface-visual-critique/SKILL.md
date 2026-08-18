---
name: interface-visual-critique
description: Read-only hierarchy, type, spacing, and contrast critique for interface files. No writer or release authority.
---

# Interface visual critique

This Skill is **read-only**. It cannot write UI files or stamp a product review. Inspect the supplied render or screenshot as well as source. When the project already provides a read-only render or browser check, it may be run to gather current visual evidence; do not install a new runtime just for critique. If no rendered evidence is available, mark visual assertions as unverified.

Record findings with `file:line`. Check:

1. One primary action and a stable hierarchy.
2. Contrast and non-color encoding.
3. Type scale, line-height, and responsive measure: Latin body copy 55–75ch, CJK body copy 24–40 full-width characters, and mixed-script runs checked against both limits.
4. Tracking: body copy stays near normal; wide spacing is limited to short Latin uppercase labels.
5. Spacing groups before extra containers.
6. Component continuity across repeated roles and default, hover, focus, disabled, loading, error, and empty states.
7. Desktop and mobile reflow, clipping, reading order, and action reachability in the render or screenshot.

Do not recommend community `$impeccable` commands or start a persistent live server.
