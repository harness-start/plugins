# Video Project Delivery Guard

`video-project-delivery-guard` 保护 `artifacts/video/<video-id>/` 下的 Remotion 工程。它按照六位数半开帧区间校验视觉和音频 manifest、source-hash MP4/WAV proof、本地媒体边界、受保护生成路径和最终 evidence role。

校验器不会从文件名推断同步或视觉质量。release 仍必须提供最终 probe、audio、frame、accessibility 和 review evidence。

## 工程契约

生产引擎固定为 Remotion。视觉和音频分别由 `src/visual/manifest.json` 与 `src/audio/manifest.json` 管理。

视觉文件名为 `vNNN-slug.fSSSSSS-fEEEEEE.tsx`，音频 binding 为 `aNNN-role-slug.fSSSSSS-fEEEEEE.audio.json`。区间统一为 `[startFrame,endFrame)`，必须与 manifest 一致且不能超出 `durationInFrames`。视觉单元不能拥有 Audio、Composition、Sequence/Series、renderer、I/O、网络或墙钟随机数；音频 binding 只能引用 `public/` 下的本地素材。

每个视觉单元需要 source-hash 静音 MP4 proof，每个音频 binding 需要 source-hash WAV proof。release 闭包包含最终 MP4、probe/frame/audio/accessibility evidence、video review、release manifest 和 receipt。

## Hook、writer 与边界

Hook 保护 MP4/WAV proof、dist/evidence/review/receipt；artifact scope 内未知的 npm/node/python/shell 修改会被拒绝。`Stop` 按 plan 的目标阶段复核帧投影、proof 和 release freshness。

`project-lint.mjs` 强制 visual owner AST rule；`project-release.mjs` 通过 `.video-delivery-journal.json` 独占写 receipt，并绑定时间线、素材/config 等输入和最终输出原始字节。任一时间线或输出变化都会使旧 receipt 失效。

文件名和 manifest 只能证明区间投影，不能证明实际编码帧数、音画同步、响度、字幕准确、闪烁或画面质量。对应 evidence 是 release 必需 role，但业务结论应由 Remotion/media probe 与独立 review 产生，Hook 不伪造结果。当前插件没有外部 Skill 依赖。

运行：

```bash
node --test plugins/video-project-delivery-guard/tests/*.test.mjs
```
