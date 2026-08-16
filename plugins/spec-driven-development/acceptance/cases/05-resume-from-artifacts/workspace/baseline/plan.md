# Plan: Greeting modules

Spec-Digest: sha256:f6e9e247374f7834caa12b3b84cf2fb6fc6fb0897ad6ea77f21df7341f99357d

## Approach
Keep REQ-001 and REQ-002 in independent modules.

## Change Surface
- src/first.mjs
- src/second.mjs
- test/first.test.mjs
- test/second.test.mjs

## Risks
- Accidental cross-module coupling.

## Validation
- Run each module's focused Node test.
