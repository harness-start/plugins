# Video Project Delivery Guard

`video-project-delivery-guard` 管 `artifacts/video/<video-id>/` 下的 Remotion 工程。要发布，项目输入必须对得上实测 MP4/WAV render proof、最终 ffprobe evidence、抽帧 hash、无障碍检查、独立宿主会话 review、release manifest 和 SHA-256 receipt。

插件要求 Node.js、npm、`ffmpeg` 和 `ffprobe`。渲染依赖由 artifact 工程自己的 `package-lock.json` 固定。

## 最小目录

```text
artifacts/video/demo/
  .gitignore
  package.json
  package-lock.json
  plan.contract.json
  plan.storyboard.json
  video.project.json
  src/
    index.ts
    Root.tsx
    Video.tsx
    timelines/
      VisualTimeline.tsx
      AudioTimeline.tsx
    visual/
      manifest.json
      v001-intro.f000000-f000090.tsx
    audio/
      manifest.json
      a001-music-bed.f000000-f000240.audio.json
  public/audio/music-bed.wav
  tools/{render-visual,render-audio}.mjs
  dist/
  evidence.*.json
  review.video.json
  release.manifest.json
  receipt.release.json
```

## 工程合同

工程根固定为 `artifacts/video/<kebab-case-id>/`。`plan.contract.json` 必须绑定 artifact 和闭包阶段：

```json
{
  "artifactId": "demo",
  "targetStage": "release"
}
```

`video.project.json` 定义实测媒体合同：

```json
{
  "artifactId": "demo",
  "compositionId": "Main",
  "durationInFrames": 240,
  "fps": 30,
  "width": 1920,
  "height": 1080
}
```

缺失或非法 JSON、未知 stage、非法目录、无效项目数量都会 fail closed。视觉和音频分别由 `src/visual/manifest.json` 与 `src/audio/manifest.json` 管理；manifest 必须非空，index 连续，id/source 唯一。

视觉文件名为 `vNNN-slug.fSSSSSS-fEEEEEE.tsx`，音频 binding 为 `aNNN-role-slug.fSSSSSS-fEEEEEE.audio.json`。区间统一为 `[startFrame,endFrame)`，必须与 manifest 一致且不能超出 `durationInFrames`。音频素材规范化后必须仍位于 `public/` 下且真实存在。视觉 owner 检查覆盖相对 import 闭包、Remotion 禁止符号及其 alias、renderer、Node I/O、网络、全局 scheduling 与墙钟随机数；项目本地 ESLint rule 在同一 public seam 上提供 AST 检查。

artifact 自己的 `package.json` 必须固定 `remotion`、`@remotion/cli`、`react` 和 `react-dom`，并提供这些受信任可执行配置脚本：

```json
{
  "scripts": {
    "video:render:visual": "node tools/render-visual.mjs",
    "video:render:audio": "node tools/render-audio.mjs",
    "video:render:final": "remotion render src/index.ts Main"
  }
}
```

render writer 通过无 shell 的 `npm run` 调用脚本，并追加固定的 `--output`、`--start-frame`、`--end-frame`、`--fps`、`--composition-id` 参数；unit proof 还会追加 `--source`。脚本只能写指定临时输出，writer 实测通过后才会将其原子提升到受保护路径。

## Writer capability 与调用流程

普通文件 Tool 不能写 proof、dist、evidence、review、release、receipt 或 capability 文件。artifact scope 内只允许严格只读 shell 命令，或者形如 `node <精确插件 tools 路径> <精确项目根> ...` 的单一 writer 调用；shell compound、`node -e`、路径子串伪装、未知命令与无法解析的命令均拒绝。

writer 必须在插件生效时通过宿主 shell Tool 调用。`PreToolUse` 只接受纯净、精确的 writer 命令，并签发有效期 30 秒、绑定 project root、writer role、完整 argv digest 与真实 host session 的一次性 capability。grant 位于受保护且从 subject 排除的 `.tmp/video-guard/`，writer 原子消费后立即失效。直接运行 writer、重放不同 argv 或伪造 reviewer session 都不能通过。

在 marketplace 根目录依次为每个已登记 unit 和最终 composition 运行；每条 writer 命令都应单独提交：

```bash
node plugins/video-project-delivery-guard/dist/cli/project-lint.mjs artifacts/video/demo
node plugins/video-project-delivery-guard/dist/cli/project-render.mjs artifacts/video/demo visual v001-intro.f000000-f000090.tsx
node plugins/video-project-delivery-guard/dist/cli/project-render.mjs artifacts/video/demo audio a001-music-bed.f000000-f000240.audio.json
node plugins/video-project-delivery-guard/dist/cli/project-render.mjs artifacts/video/demo final
node plugins/video-project-delivery-guard/dist/cli/project-probe.mjs artifacts/video/demo
```

这些 writer 必须作为启用插件的宿主 shell Tool 中的单一命令执行，Hook 才能签发一次性 capability；在普通终端直接运行会被拒绝。干净环境还需先在 artifact root 按 `package-lock.json` 安装依赖，并确认 `ffmpeg`、`ffprobe` 可执行。

## Render、probe、review 与 release

`project-render.mjs` 将输出写入唯一临时路径，再用 ffprobe 验证：

- visual proof：MP4、精确帧长/fps/宽高、无音轨；
- audio proof：WAV、精确帧长、有效 sample rate/channels、无视频轨；
- final：MP4、精确帧长/fps/宽高，同时存在视频与音频轨。

媒体通过后才会被原子提升到保护路径并生成 `render-proof/v1`。proof 绑定完整非生成 subject digest、具体 source digest、输出原始字节 digest、实测媒体事实、writer capability 和生成 session。任何源码、素材、配置或工具链变化都会使旧 proof 失效。

`project-probe.mjs` 重新测量最终 MP4，生成 `probe-evidence/v1` 与 `audio-evidence/v1`。review 必须运行在不同于 render 的真实宿主会话中，输入文件必须位于 artifact root 外：

```json
{
  "schema": "video-project-delivery-guard/review-input/v1",
  "artifactId": "demo",
  "outputSha256": "<64 个小写十六进制字符>",
  "verdict": "pass",
  "reviewer": {
    "kind": "independent-agent",
    "id": "reviewer-1",
    "sessionId": "<当前 reviewer 宿主会话 id>"
  },
  "frames": [0, 120, 239],
  "checks": {
    "captionsReviewed": true,
    "flashingReviewed": true,
    "contrastReviewed": true
  },
  "notes": "Review summary"
}
```

然后运行：

```bash
node plugins/video-project-delivery-guard/dist/cli/project-review.mjs artifacts/video/demo /tmp/video-review-input.json
node plugins/video-project-delivery-guard/dist/cli/project-release.mjs artifacts/video/demo
```

reviewer session 取自一次性 capability，不能只信任输入 JSON。review writer 用 ffmpeg 抽取至少 start/interior/final 三帧并记录 PNG 字节 hash，同时生成结构化 accessibility 与 review evidence。release writer 会拒绝缺失、过期、自审、格式错误或字节不匹配的 evidence；只有全部 proof/evidence 当前且结构有效时，才生成绑定所有交付角色的 `release-manifest/v1` 和 receipt v2。

## 原子性与资源边界

各 writer 使用独占 `.video-delivery-journal.json`、唯一临时文件和 rename。只有完整成功后才回收 journal；报错或异常中断会留下 journal，`Stop` 会阻断完成态，直到操作者核对并清理半写入结果。

## 失败恢复

- `*_RENDER_PROOF_INVALID`：重新运行 finding 对应的 `project-render.mjs`；不要手改 proof JSON 或重命名旧媒体。
- `PROBE_*` 或音轨/时长/尺寸不匹配：检查 artifact render script 与 `video.project.json`，重新渲染 final，再运行 probe。
- `FRAME_EVIDENCE_INVALID`、`ACCESSIBILITY_EVIDENCE_INVALID` 或自审错误：在不同宿主会话重新审查，并确保输入文件位于 artifact root 外且摘要绑定当前 final MP4。
- `RECEIPT_INVALID`：任一输入或输出在 release 后变化；从最早失效阶段重新生成，再执行 release。
- `MUTATION_JOURNAL_OPEN`：先确认没有 writer 仍在运行，检查 journal 指示的阶段和 `.tmp/video-guard/` 临时文件；在停用本插件 Hook 的维护窗口只清理该项目残留 journal/临时文件，然后从该阶段重跑。
- capability missing/expired/argv mismatch 表示 writer 没有获得当前宿主授权；用相同宿主会话重新提交一条精确、无串联的 writer 命令。

项目 loader 对所有文件使用流式 SHA-256。二进制媒体不会被解码为 UTF-8，只有有界文本会载入合同模型。默认限制为 4096 个文件、单文件 8 GiB、单文本 4 MiB、最多 32 个视频项目；超过限制或读取期间发生变化均 fail closed。`SessionStart` 只做发现，Post/Failure/Stop 最多运行 120 秒且只哈希和校验，不启动编码器或 reviewer。

## 验证与证明边界

```bash
npx tsx --test plugins/video-project-delivery-guard/tests/*.test.ts
./scripts/acceptance/run.sh --plugin video-project-delivery-guard
```

这套检查发生在宿主能看到的 Tool/Hook 边界里，顺序是 render → measure → 独立会话 review → release。它不是操作系统沙箱。宿主看不见的进程、被改过的项目 render 脚本、被换掉的系统 ffmpeg/ffprobe，或手里有直接磁盘权限的人，都不在 `snapshot` profile 里。

校验器能核对文件和帧投影、实际 container/stream/尺寸/时长、Hook 信任边界内的 writer 来源、evidence 结构，以及 snapshot 还新不新。审美、叙事、字幕语义、内容真假或真人身份，它自动判不了。结构化 review 会记下这些判断和 session 来源，但那不是法律签名，也不是身份认证。当前插件没有外部 Skill 依赖。

Claude Code 使用 `CLAUDE_PLUGIN_ROOT` 并可观察 `PostToolUseFailure`；Codex 使用 `PLUGIN_ROOT`，Hook 命令设置 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM`。安装态 writer 使用对应变量或已安装插件的精确绝对路径，不能使用 `...` 占位。reviewer 身份以 capability 里的真实宿主 session 为准，不能由输入 JSON 自报。live acceptance 必须通过仓库脚本进入 `docker/host-acceptance`，不能直接在宿主机启动 Claude Code 或 Codex 会话。
