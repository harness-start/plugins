import assert from "node:assert/strict";
import test from "node:test";

test("diagram initializer contract includes a node-bound communication core", () => {
  const scaffold = { communicationCore: { retellTarget: "Input becomes an explained output.", signatureCue: { anchors: ["node:process"] } } };
  assert.equal(scaffold.communicationCore.retellTarget.length > 0, true);
  assert.deepEqual(scaffold.communicationCore.signatureCue.anchors, ["node:process"]);
});
