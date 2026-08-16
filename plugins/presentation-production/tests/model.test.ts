import assert from "node:assert/strict";
import test from "node:test";

import fc, { type Command } from "fast-check";

import { validatePptxReceipt, type PptxModel } from "../src/lib/contract.js";
import { releaseModel, sha256 } from "./fixture.js";

type ReceiptState = { valid: boolean };
type ReceiptSystem = { model: PptxModel };

class MutateBoundByte implements Command<ReceiptState, ReceiptSystem> {
  constructor(private readonly target: "source" | "preview" | "output", private readonly suffix: string) {}
  check = () => true;
  run(model: ReceiptState, system: ReceiptSystem) {
    const files = system.model.files!;
    const path = this.target === "source"
      ? "src/slides/001-opening.ts"
      : this.target === "output"
        ? "dist/deck.pptx"
        : Object.keys(files).find((candidate) => candidate.startsWith("src/slides/") && candidate.endsWith(".png"))!;
    const current = Buffer.isBuffer(files[path]) ? files[path] as Buffer : Buffer.from(String(files[path]));
    files[path] = Buffer.concat([current, Buffer.from(this.suffix)]);
    system.model.digests![path] = sha256(files[path] as Buffer);
    model.valid = false;
    assert.equal(validatePptxReceipt(system.model), model.valid);
  }
  toString = () => `mutate-${this.target}`;
}

test("model-based byte mutations cannot preserve a release receipt", () => {
  const command = fc.tuple(fc.constantFrom("source", "preview", "output"), fc.string({ minLength: 1, maxLength: 8 }))
    .map(([target, suffix]) => new MutateBoundByte(target, suffix));
  fc.assert(fc.property(fc.commands([command], { maxCommands: 8 }), (commands) => {
    fc.modelRun(() => ({ model: { valid: true }, real: { model: releaseModel() } }), commands);
  }), { numRuns: 100 });
});
