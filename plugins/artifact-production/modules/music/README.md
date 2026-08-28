# 音乐项目交付守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `artifact-production` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`music-production` 为 Codex 和 Claude 提供一条可审计的器乐生产链：

```text
brief → reference-analysis（按需）→ direction → composition → arrangement → optimize → render → preview → independent review → release
```

当前渲染引擎仍是浏览器中的 `Tone.Offline`。插件支持固定速度/拍号、十二平均律、合成器乐器和 48 kHz 双声道 PCM16 WAV；本轮不支持采样、人声、外部音乐生成、MIDI、MP3、速度图、拍号变化或微分音。

## 目标

把器乐 brief、参考画像、创意方向、作曲、配器、优化、渲染、试听证据、独立听审和 release 绑定为可审计链路。插件防止旧 mix/stem 复用、自审、伪造顾问结果和普通工具直接修改受保护 evidence。

## 实现

`music-project-authoring` 组织生产，`music-project-review` 只允许独立会话听审；四个第一方顾问只提供建议。登记 CLI 负责项目初始化、建议/参考准入、优化、Tone.js 离线渲染、WAV 探测、review 和 release。Hook 为精确 mutation writer 签发一次性 capability，并在 Post/Failure/Stop 阶段重算 journal、摘要与 receipt。

## 两个独立 Skill

- `$music-project-authoring` 负责 brief、创意方向、外部知识编排、作曲、配器、优化、渲染、预览、返工与 release。
- `$music-project-review` 必须在没有生成当前 render 的独立 session 中运行。它只能听审当前 mix/stems 并通过受控 writer 提交 `approved` 或 `changes_requested`，不能修改作品或发布。

第一方顾问捆绑在本插件内：`music-composition-method`、`music-genre-reference`、`music-reference-profile`、`music-mix-qc`。它们只有 adviser/reference 权限，禁止执行外部脚本、生成器、网络发布或直接写项目。作曲方法来自 SJY051/music-composition（CC-BY-4.0，见 `licenses/music-composition/NOTICE.md`）。

## 快速开始

以下 mutating 命令应在已安装插件的 Claude/Codex 会话中作为精确工具调用执行，由 PreToolUse Hook 签发一次性 capability；直接在普通终端运行会以 `WRITER_CAPABILITY_MISSING` 拒绝。

```bash
export PLUGIN_ROOT="$PWD/plugins/music-production"

node "$PLUGIN_ROOT/dist/cli/project-init.mjs" "artifacts/music/demo-track" --install-browser
node "$PLUGIN_ROOT/dist/cli/project-lint.mjs" "artifacts/music/demo-track"
node "$PLUGIN_ROOT/dist/cli/project-optimize.mjs" "artifacts/music/demo-track"
node "$PLUGIN_ROOT/dist/cli/project-render.mjs" "artifacts/music/demo-track"
node "$PLUGIN_ROOT/dist/cli/project-preview.mjs" "artifacts/music/demo-track"
```

初始化会建立 `plan.brief.json`、`plan.direction.json`、`plan.arrangement.json`、`plan.skill-composition.json`、`music.project.json` 和可审查的 `src/**`。若使用顾问，将当前 digest 绑定的结构化结果写在项目目录外，再通过受控 writer 准入：

```bash
node "$PLUGIN_ROOT/dist/cli/project-advice.mjs" \
  "artifacts/music/demo-track" "/absolute/path/to/advice.json"
```

brief 只有抽象技术 traits 时使用 `reference.mode: "traits"`。给出艺人或参考曲时改为 `source-analysis`，在项目外准备 3–5 项来源清单和 `music-reference-profile` 六维画像，再准入匿名画像：

```bash
node "$PLUGIN_ROOT/dist/cli/project-reference.mjs" \
  "artifacts/music/demo-track" \
  "/absolute/path/to/reference-sources.json" \
  "/absolute/path/to/reference-profile.json"
```

来源清单保留艺人名和曲名，但不会复制进项目。准入画像只保留节奏、和声、演奏/音色、制作审美、风格融合、能量结构、5–10 个描述词、Tone.js 映射和明确不支持的 traits。brief 或来源摘要变化会令画像失效；缺少 `music-reference-profile` 表示插件包损坏，不能伪造降级结果。

## Evidence 与 Review

优化器生成 digest 命名的 score/metrics；renderer 生成 mix、每轨 stem 和 render receipt。`project-preview` 只消费当前 render，不会重新渲染或改写 mix，并生成 `evidence/preview.<subjectDigest>.json`，记录 mix/stem 摘要和客观 WAV 指标。“可供试听”不等于“已经听过”。

独立 reviewer 必须覆盖当前 brief、score、render receipt、preview、mix 和全部 stems；使用 source analysis 时还必须覆盖匿名参考画像并检查 `reference-profile-alignment`。finding 必须绑定精确路径和 SHA-256；批准时 blocker/major 必须有复核证据。

新项目的 reviewer 在项目外准备 `music-production/review-input/v2` JSON；legacy brief 继续接受 v1。提交命令为：

```bash
node "$PLUGIN_ROOT/dist/cli/project-review.mjs" \
  "artifacts/music/demo-track" "/absolute/path/to/review-input.json"
```

作品发生变化后，原 render、preview 和 review 都会因 digest 不匹配而失效。

`brief/v1`、四顾问 `skill-composition/v1` 和 `review/v1` 继续用于 legacy 项目。新初始化项目使用 v2；由于 `0.4.0` 更新了 engine digest，旧项目升级插件后需要重新生成 optimize、render、preview 和 review 证据。只有启用 source analysis 时才需要把 brief 和顾问编排改为 v2，本轮不提供自动迁移 writer。

## Release 与 Hook 约束

批准后才能单调推进并发布：

```bash
node "$PLUGIN_ROOT/dist/cli/project-stage.mjs" "artifacts/music/demo-track" release
node "$PLUGIN_ROOT/dist/cli/project-release.mjs" "artifacts/music/demo-track"
```

Hooks 对 mutating CLI 签发短时、一次性、绑定 argv/session/subject digest 的 capability。source-analysis 缺少当前画像时，direction、arrangement、composition、instrument 以及 optimize/render/preview/review/stage/release 都会被阻止。命令拼接、重定向、wrapper 伪装、直接写受保护产物同样会被拒绝。Post/Failure/Stop hooks 会报告未关闭 journal、陈旧 evidence 或未完成 release。

客观分析可发现静音、削波、电平、格式和 DC 偏移问题，但不能证明艺术质量；独立实际听审仍是 release 的必要条件。

## 开发验证

```bash
npx tsx --test plugins/music-production/tests/*.test.ts
npm run check:dist
./scripts/acceptance/run.sh --plugin music-production
```

Live acceptance 必须由仓库脚本封装到 `docker/host-acceptance` 中运行。
