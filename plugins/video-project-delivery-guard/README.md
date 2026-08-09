# Video Project Delivery Guard

Guards Remotion projects under `artifacts/video/<video-id>/`. It verifies visual and audio manifests against six-digit half-open frame intervals, source-hash MP4/WAV proofs, local media boundaries, protected generated paths, and final evidence roles.

The validator does not infer sync or visual quality from filenames. Final probe, audio, frame, accessibility, and review evidence remain required at release.

帧区间、视/音轨 owner 与 receipt 边界见 [DESIGN.md](DESIGN.md)。当前登记 writer 为项目本地 ESLint wrapper 与原子 release writer。

Run:

```bash
node --test plugins/video-project-delivery-guard/tests/*.test.mjs
```
