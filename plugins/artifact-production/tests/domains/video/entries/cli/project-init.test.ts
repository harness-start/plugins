import assert from "node:assert/strict";
import test from "node:test";

test("video initializer contract binds its signature cue to the scaffold beat", () => {
  const direction = { communicationCore: { signatureCue: { anchors: ["beat:opening"] } } };
  const storyboard = { beats: [{ id: "opening", coreContribution: "Introduces the intended transformation." }] };
  assert.equal(direction.communicationCore.signatureCue.anchors[0], `beat:${storyboard.beats[0].id}`);
});
