# Poster Project Delivery Guard

`poster-production` 为 `artifacts/poster/<poster-id>/` 提供统一的数字海报编排入口 `$poster-project-authoring`，并用 React/TSX、Satori、resvg、结构化 evidence 和独立审查把 brief、源码、SVG、PNG 与 release receipt 绑定起来。当前只覆盖数字交付，不宣称印刷色彩或物理打样能力。

插件包含两个 Skill：

- `$poster-project-authoring`：主编排入口，负责 profile、art direction、顾问组合、设计系统、资产、layer、渲染、探测和发布；
- `$poster-project-review`：只能由独立 session 使用，检查全部当前 PNG，并通过受控 writer 导入 digest-bound 结论。

四个外部 Skill 通过 `skill-deps.json` 跟随上游当前版本，只提供只读建议：`regional-culture-poster`、`qiaomu-mondo-poster-design`、`cvpr-2026-poster` 和 `impeccable`。它们不能运行脚本、写项目、签审查或发布；编排 Skill 必须记录每个顾问为 `used`、`skipped` 或 `unavailable`。

## v2 项目模型

```text
artifacts/poster/launch-poster/
  .gitignore
  package.json
  package-lock.json
  plan.contract.json
  plan.art-direction.json
  plan.skill-composition.json
  plan.assets.json
  design.system.json
  poster.project.json
  data/main.json
  src/
    render.ts
    compose.ts
    theme.ts
    variants/
      manifest.json
      001-main/
        variant.json
        layers/
          manifest.json
          001-background-base.tsx
          002-title-primary.tsx
  dist/
    launch-poster.main.svg
    launch-poster.main.png
  evidence/
    layers/main/<layer>.<source-sha256>.svg
    layers/main/<layer>.<source-sha256>.png
  evidence.render.json
  evidence.probe.json
  evidence.accessibility.json
  review.poster.json
  release.manifest.json
  receipt.release.json
```

支持 `regional-culture`、`mondo`、`editorial`、`academic`、`custom` 五种 profile。profile 只规定设计决策和质量门，不替代 brief；Mondo 只采用符号压缩、有限色和丝网印刷等一般原则，不模仿具体在世艺术家。

variant 与 layer 顺序分别只由各自 manifest 决定。layer 文件名为 `NNN-<role>-slug.tsx`，第一层必须是 `background`，且每个模块只实现一个确定性的 `buildLayer`。layer 不能自行设置 `zIndex`、访问文件/网络、调用 Satori/resvg、使用 React client Hook、导入 sibling layer 或使用时间/随机性。

## 确定性流水线

启用插件 Hook 后，让宿主把下面每条 writer 作为一条独立 Bash 命令执行；PreToolUse 会发放一次性、短时、argv/session/subject-bound capability。直接绕过 Hook 调用 mutation writer 会以 `WRITER_CAPABILITY_MISSING` 失败。

```bash
node "${PLUGIN_ROOT}/dist/cli/project-init.mjs" artifacts/poster/launch-poster --profile editorial
node "${PLUGIN_ROOT}/dist/cli/project-lint.mjs" artifacts/poster/launch-poster
node "${PLUGIN_ROOT}/dist/cli/project-render.mjs" artifacts/poster/launch-poster
node "${PLUGIN_ROOT}/dist/cli/project-probe.mjs" artifacts/poster/launch-poster
node "${PLUGIN_ROOT}/dist/cli/project-review.mjs" artifacts/poster/launch-poster /absolute/external/review-input.json
node "${PLUGIN_ROOT}/dist/cli/project-release.mjs" artifacts/poster/launch-poster
```

Claude Code 使用 `CLAUDE_PLUGIN_ROOT`；Codex 使用 `PLUGIN_ROOT`。初始化器写入固定版本的渲染依赖并以 `npm install --ignore-scripts` 生成 lockfile。渲染器先让项目 Satori 源生成自包含 SVG，再由固定 resvg 生成 PNG，并为每层保留源 hash proof。probe 会重新栅格化 SVG，要求 PNG 字节一致，同时检查尺寸、非空 alpha、语义色对比、字号下限和非颜色编码。

审查输入必须位于项目外部，绑定当前 `subjectDigest`、每个 variant 的 PNG SHA-256、独立 session 和八项视觉检查。review writer 拒绝 producer session、自审、漏 variant、旧 digest 和未处置 finding。release manifest 同时记录 SVG/PNG 路径、尺寸和 SHA-256；receipt 再绑定全部成品、layer proof 和 evidence 原始字节。

任意 brief、依赖、设计系统、copy、asset、variant、layer 或源码变化都会改变 `subjectDigest`，使 render/probe/review/release 证据过期。任意成品或 evidence 字节变化都会使 receipt 失效。

## 保护边界与恢复

`dist/`、`evidence*`、review、release、receipt、journal，以及 variant 下的 SVG/PNG 只能由登记 writer 修改。shell 策略只放行精确 writer 调用和保守的只读命令；`node -e`、`sed`、`dd`、`find -fprint`、`rg --pre`、`git --output` 等可变异或可执行形状会 fail closed。Hook 是宿主工具边界，不是操作系统沙箱；宿主外进程不在其可观察范围内。

- `LAYER_PROOF_MISSING` / `RENDER_EVIDENCE_INVALID`：从 lint 重新执行 render，不要复用或改名旧 proof。
- `PROBE_EVIDENCE_INVALID` / `ACCESSIBILITY_EVIDENCE_INVALID`：修正源码或 design system，再执行 render → probe。
- `REVIEW_INVALID` / `REVIEW_SELF`：使用另一个 session 重新检查当前 PNG 并提交外部 review input。
- `RECEIPT_INVALID`：上游或交付字节在签发后变化；从最早失效阶段重新执行。
- `MUTATION_JOURNAL_OPEN`：确认 writer 已退出，检查半成品；在明确维护窗口清理本项目残留 journal 后重跑该阶段。
- `PROTECTED_WRITER_REQUIRED` / `UNKNOWN_MUTATION_SHELL`：写入没有执行；改用精确登记 writer，不要重复同一绕过命令。

## 验证

在 marketplace 根目录运行：

```bash
npx tsx --test plugins/poster-production/tests/*.test.ts
npm run check:dist
```

本插件测试为离线单元/集成测试。任何 Claude Code / Codex live acceptance 必须通过仓库规定的 Docker host-acceptance 入口运行。
