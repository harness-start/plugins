import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createVideoReceipt,
  evaluateVideoWrite,
  validateVideoModel,
  validateVideoReceipt,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  const visual = "export function Intro() { const frame = useCurrentFrame(); return <div>{frame}</div>; }\n";
  const audio = JSON.stringify({ asset: "public/audio/bed.wav", trackId: "music", role: "music", startFrame: 0, endFrame: 240 });
  const visualDigest = sha256(visual);
  const audioDigest = sha256(audio);
  return {
    artifactId: "launch-video",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": "{}\n",
      "plan.storyboard.json": "{}\n",
      "video.project.json": "{}\n",
      "src/index.ts": "registerRoot(Root);\n",
      "src/Root.tsx": "export const Root = () => <Composition id='main' />;\n",
      "src/Video.tsx": "export const Video = () => <><VisualTimeline/><AudioTimeline/></>;\n",
      "src/timelines/VisualTimeline.tsx": "export const VisualTimeline = () => null;\n",
      "src/timelines/AudioTimeline.tsx": "export const AudioTimeline = () => <Audio />;\n",
      "src/visual/manifest.json": JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 90, source: "v001-intro.f000000-f000090.tsx" }] }),
      "src/visual/v001-intro.f000000-f000090.tsx": visual,
      [`src/visual/v001-intro.f000000-f000090.${visualDigest}.mp4`]: "MP4",
      "src/audio/manifest.json": JSON.stringify({ units: [{ index: 1, id: "music-bed", role: "music", startFrame: 0, endFrame: 240, source: "a001-music-bed.f000000-f000240.audio.json" }] }),
      "src/audio/a001-music-bed.f000000-f000240.audio.json": audio,
      [`src/audio/a001-music-bed.f000000-f000240.${audioDigest}.wav`]: "WAV",
    },
    project: { artifactId: "launch-video", durationInFrames: 240, fps: 30 },
  };
}

test("accepts matching visual and audio frame projections with source-hash proofs", () => {
  assert.deepEqual(validateVideoModel(validModel(), { stage: "source" }), []);
});

test("reports a visual owner violation and stale visual proof", () => {
  const model = validModel();
  model.files["src/visual/v001-intro.f000000-f000090.tsx"] = "export function Intro() { return <Audio src='x' />; }\n";

  const codes = validateVideoModel(model, { stage: "source" }).map(({ code }) => code);

  assert.deepEqual(codes, ["VISUAL_OWNER_VIOLATION", "VISUAL_PROOF_MISSING"]);
});

test("reports an interval that exceeds the composition duration", () => {
  const model = validModel();
  model.files["src/visual/manifest.json"] = JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 300, source: "v001-intro.f000000-f000300.tsx" }] });

  const codes = validateVideoModel(model, { stage: "source" }).map(({ code }) => code);

  assert.ok(codes.includes("FRAME_INTERVAL_INVALID"));
});

test("denies direct video proof and dist writes but allows visual source", () => {
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/dist/launch.mp4", toolName: "Write" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/src/audio/a001-bed.f000000-f000010.abc.wav", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluateVideoWrite({ relativePath: "artifacts/video/launch/src/visual/v001-intro.f000000-f000090.tsx", toolName: "apply_patch" }), { decision: "allow" });
});

test("release receipt rejects a changed timeline dependency or output", () => {
  const model = validModel();
  Object.assign(model.files, {
    "dist/launch-video.mp4": "MP4-FINAL",
    "evidence.probe.json": "{}\n",
    "evidence.frames.json": "{}\n",
    "evidence.audio.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.video.json": "{}\n",
    "release.manifest.json": "{}\n",
  });
  model.files["receipt.release.json"] = JSON.stringify(createVideoReceipt(model));

  assert.equal(validateVideoReceipt(model), true);
  model.files["src/timelines/VisualTimeline.tsx"] += "export const changed = true;\n";
  assert.equal(validateVideoReceipt(model), false);
});
