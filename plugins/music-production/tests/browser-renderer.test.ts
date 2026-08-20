import assert from "node:assert/strict";
import test from "node:test";

import { callExpressionSources, callExpressionTexts, identifierNames, importSpecifiers, syntaxDiagnostics } from "../../../core/tests/support/typescript-source.js";
import { createBrowserEntry } from "../src/lib/browser-renderer.js";

test("builds a browser-only Tone.Offline entry with static instrument ownership", () => {
  const entry = createBrowserEntry({
    tracks: [
      { id: "lead", instrument: "src/instruments/lead.mjs" },
      { id: "bass", instrument: "src/instruments/bass.mjs" },
    ],
  });

  assert.deepEqual(syntaxDiagnostics(entry, "browser-entry.mjs"), []);
  assert.deepEqual(importSpecifiers(entry, "browser-entry.mjs"), [
    "tone",
    "./src/instruments/lead.mjs",
    "./src/instruments/bass.mjs",
  ]);
  const calls = callExpressionTexts(entry, "browser-entry.mjs");
  assert.equal(calls.includes("Tone.Offline"), true);
  assert.equal(calls.includes("Tone.dbToGain"), true);
  const callSources = callExpressionSources(entry, "browser-entry.mjs");
  assert.equal(
    callSources.some((call) => call.startsWith("Array.from(") && call.includes("buffer.getChannelData")),
    false,
  );
  const identifiers = identifierNames(entry, "browser-entry.mjs");
  assert.equal(identifiers.has("__tonejsChunk"), true);
  assert.equal(identifiers.has("trackId"), true);
});
