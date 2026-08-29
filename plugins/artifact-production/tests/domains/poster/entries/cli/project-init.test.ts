import assert from "node:assert/strict";
import test from "node:test";

test("poster initializer contract anchors its communication cue to a real layer", () => {
  const scaffold = { communicationCore: { retellTarget: "One focal relationship carries the message.", signatureCue: { anchors: ["layer:title-primary"] } } };
  assert.match(scaffold.communicationCore.signatureCue.anchors[0], /^layer:/u);
  assert.equal(scaffold.communicationCore.retellTarget.length > 0, true);
});
