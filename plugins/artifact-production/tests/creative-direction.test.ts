import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

function skill(name: string) {
  return readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
}

test("creative direction is bounded read-only advice with visible convergence", () => {
  const body = skill("artifact-creative-direction");
  assert.match(body, /read-only/iu);
  assert.match(body, /one technique|exactly one/iu);
  assert.match(body, /(?:no more than|maximum of) three/iu);
  assert.match(body, /duplicate|dead end|abandon/iu);
  assert.match(body, /cost/iu);
  assert.match(body, /risk/iu);
  assert.match(body, /validat/iu);
  assert.match(body, /recommend/iu);
  assert.match(body, /does not write the artifact/iu);
  assert.match(body, /do not.*release.*issue receipts|does not.*release.*issue.*receipts/isu);
});

test("primary authoring skills may consume direction only before initialization", () => {
  for (const name of [
    "diagram-project-authoring",
    "logo-project-authoring",
    "music-project-authoring",
    "poster-project-authoring",
    "pptx-deck-authoring",
    "training-program-design",
    "video-project-authoring",
  ]) {
    const body = skill(name);
    assert.match(body, /artifact-creative-direction/u, name);
    assert.match(body, /before.*init|pre-init/iu, name);
    assert.match(body, /existing brief|same brief/iu, name);
    assert.match(body, /advice.*not.*evidence|not.*evidence.*advice/isu, name);
  }
});
