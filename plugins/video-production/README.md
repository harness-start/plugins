# Video Project Delivery Guard

`video-production` 为 `artifacts/video/<video-id>/` 提供一个统一的 Remotion 视频生产编排入口、一个只读独立审查入口，以及由摘要绑定的 init → plan → admit → compose → render → probe → review → release 交付闭环。

插件要求 Node.js、npm、`ffmpeg` 和 `ffprobe`。项目依赖由 artifact 内的 `package-lock.json` 固定，当前 scaffold 固定 Remotion `4.0.512` 与 React `19.2.8`。

## 编排入口

- `$video-project-authoring`：手动触发，或由 motion explainer、产品宣传、短视频、口播、参考视频复刻、微短剧等创作请求自动触发。主 agent 始终拥有项目文件和交付判断。
- `$video-project-review`：只在独立宿主会话中触发；只读检查最终媒体和证据，不修改项目源文件。

authoring Skill 会根据 `motion-explainer`、`product-promo`、`short-form`、`talking-head`、`reference-led` 或 `micro-drama` profile 选择顾问组合。外部 Skill 默认只提供建议；需要调用外部模型的 worker 必须在 artifact 外运行，再通过准入 writer 导入。所有 worker 均固定到 `skill-deps.json` 中的精确 revision，并在 `plan.skill-composition.json` 如实记录 `used`、`skipped` 或 `unavailable`。

## 最小流程

每个 writer 都必须作为启用插件的宿主 shell Tool 中的一条独立命令执行，不能串联、重定向、管道或包装：

```bash
node plugins/video-production/dist/cli/project-init.mjs artifacts/video/demo --profile motion-explainer --mode guided
node plugins/video-production/dist/cli/project-lint.mjs artifacts/video/demo
node plugins/video-production/dist/cli/project-render.mjs artifacts/video/demo visual v001-intro.f000000-f000090.tsx
node plugins/video-production/dist/cli/project-render.mjs artifacts/video/demo audio a001-music-bed.f000000-f000240.audio.json
node plugins/video-production/dist/cli/project-render.mjs artifacts/video/demo final
node plugins/video-production/dist/cli/project-probe.mjs artifacts/video/demo
node plugins/video-production/dist/cli/project-review.mjs artifacts/video/demo /tmp/video-review-input.json
node plugins/video-production/dist/cli/project-release.mjs artifacts/video/demo
```

guided 模式要求 direction、storyboard、assets 三道当前摘要绑定的 approval；autonomous 模式可使用写明理由的 waiver。任何 direction、script、storyboard、asset、design、source 或 toolchain 变化都会使下游 proof/evidence 失效。

## 外部媒体准入

外部生成器、剪辑器、TTS 或字幕工具只能写 artifact 根目录之外。其 manifest 必须声明精确 Skill revision、provider/model、成本、run id、输出绝对路径与可选 SHA-256；对应 asset 需事先在 `plan.assets.json` 中声明为 `external-run`。随后执行：

```bash
node plugins/video-production/dist/cli/project-admit.mjs artifacts/video/demo /tmp/external-run.json
```

准入 writer 会检查预算、worker 声明、rights、媒体类型、普通文件边界、大小、摘要和音视频结构，原子复制到 `public/admitted/`，并写入 `evidence/admissions/<run-id>.json`。普通 Tool 和外部 worker 不能直接写 admitted、proof、evidence、review、release 或 receipt 路径。

## Probe 与独立 review

probe 在最终 MP4 上重新测量 container、stream、fps、尺寸和精确帧数，并产生：

- `evidence.audio.json`：音轨事实、integrated LUFS 与 true peak；
- `evidence.motion.json`：每个 storyboard beat 的起/中/末解码帧摘要及运动覆盖；
- `evidence.captions.json`：字幕区间、重叠和阅读速度；
- `evidence.reference.json`：声明为 frame-aligned 时的全视频 SSIM/PSNR；
- `evidence/contact-sheet.png`：与 motion evidence 摘要绑定的接触表。

review input 必须位于 artifact 外，并绑定当前 final digest：

```json
{
  "schema": "video-production/review-input/v2",
  "artifactId": "demo",
  "outputSha256": "<64 lowercase hex>",
  "verdict": "pass",
  "reviewer": { "kind": "independent-agent", "id": "reviewer-1", "sessionId": "<current host session>" },
  "frames": [0, 120, 239],
  "checks": {
    "narrative": "pass", "pacing": "pass", "motionContinuity": "pass",
    "shotComposition": "pass", "typography": "pass", "color": "pass",
    "captions": "pass", "audio": "pass", "sourceIntegrity": "pass",
    "assetRights": "pass", "profileFidelity": "pass"
  },
  "accessibility": { "captionsReviewed": true, "flashingReviewed": true, "contrastReviewed": true },
  "findings": [],
  "notes": "Review summary"
}
```

`reference-led` 还要求 `referenceFidelity: "pass"`，`micro-drama` 还要求 `characterContinuity: "pass"`。reviewer 会话必须不同于 render，会由一次性 capability 的真实 session 校验；release 会话也必须不同于 reviewer。

## 证明边界

release 只有在 proof、probe、独立 review、release manifest 全部与当前字节一致时才生成 receipt v3。自动检查能证明项目结构、帧投影、媒体属性、摘要新鲜度和受控 writer 来源；不能自动证明审美质量、叙事清晰度、事实真实性、权利声明真实性或真人身份。结构化 review 记录这些判断及来源，但不是法律签名或身份认证。

本插件是宿主 Tool/Hook 边界，不是操作系统沙箱。拥有直接磁盘权限的进程、被替换的系统媒体工具或插件不可见的进程不在其证明范围内。

## 验证

```bash
npx tsx --test plugins/video-production/tests/*.test.ts
./scripts/acceptance/run.sh --plugin video-production
```

live acceptance 必须由仓库脚本进入 `docker/host-acceptance`，不能在宿主直接启动 Claude Code 或 Codex。
