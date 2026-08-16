import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserEntry } from "../src/lib/browser-renderer.js";

test("builds a browser-only Tone.Offline entry with static instrument ownership", () => {
  const entry = createBrowserEntry({
    tracks: [
      { id: "lead", instrument: "src/instruments/lead.mjs" },
      { id: "bass", instrument: "src/instruments/bass.mjs" },
    ],
  });

  assert.match(entry, /import \* as Tone from "tone"/u);
  assert.match(entry, /Tone\.Offline/u);
  assert.match(entry, /Tone\.dbToGain\(-6\)/u);
  assert.match(entry, /__tonejsChunk/u);
  assert.doesNotMatch(entry, /Array\.from\(buffer\.getChannelData/u);
  assert.match(entry, /src\/instruments\/lead\.mjs/u);
  assert.match(entry, /trackId !== null/u);
});
