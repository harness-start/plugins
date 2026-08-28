# PPTX 项目交付守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `artifact-production` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`presentation-production` 为从零制作的 16:9、原生可编辑 PPTX 提供一条受保护的交付链。插件内置 `pptx-deck-authoring` 编排 Skill 与 `pptx-deck-review` 独立审查 Skill，并将 source、design、render、probe、review、release 六阶段落实为可检查的工程合同。

v1 不编辑现有 PPTX，也不套用外部模板。最终闭包包含同一源生成的 `.pptx`、`.pdf`、逐页 PNG、source-hash 预览、结构/设计/无障碍证据、独立审查、release manifest 与 receipt。

## 目标

把 16:9 原生可编辑演示文稿的故事板、设计系统、逐页源码、PPTX/PDF/PNG、探测证据和独立审查连成同源交付链，防止页序漂移、空壳文件、旧预览、自审或直接修改受保护成品。

## 实现

`pptx-deck-authoring` 负责编排，`pptx-deck-review` 在独立会话审查；storyboard 与视觉 critique Skill 只提供阶段建议。PptxGenJS 生成 PPTX，LibreOffice 从该 PPTX 导出 PDF，Poppler 渲染逐页 PNG。登记 CLI 完成 init、lint、render、probe、review 与 release；Hook 对精确命令发放一次性 capability，receipt 绑定全部当前产物和 evidence。

## 编排与第一方顾问

`pptx-deck-authoring` 是唯一编排入口。它保持用户目标、项目源文件、门禁决策和最终交付责任；捆绑 Skill 只是阶段 worker：

- `presentation-storyboard` 只提供 storyboard 与 PptxGenJS source 建议。
- `presentation-visual-critique` 只提供层级、排版、间距和颜色系统建议。

worker 的 `used` / `skipped` / `unavailable` 状态写入 `plan.skill-composition.json`。worker 不能写 `dist/`、预览、evidence、review、manifest 或 receipt。

## 工程闭包

```text
artifacts/pptx/quarterly-review/
  plan.contract.json
  plan.storyboard.json
  plan.skill-composition.json
  design.system.json
  pptx.project.json
  src/deck.ts
  src/theme.ts
  src/slides/manifest.json
  src/slides/001-opening.ts
  src/slides/001-opening.<source-sha256>.png
  dist/quarterly-review.pptx
  dist/quarterly-review.pdf
  dist/pages/001.png
  evidence.render.json
  evidence.structure.json
  evidence.design.json
  evidence.accessibility.json
  review.pptx.json
  release.manifest.json
  receipt.release.json
```

`manifest.json` 是唯一页序。每页映射一个连续编号的 `NNN-slug.ts`；slide 模块只修改传入 slide，不能创建页面、写文件、联网、读取墙钟、使用随机数或导入 sibling slide。

## 注册管线

在安装后的 agent 会话中，按编排 Skill 依次调用以下独立命令。`${PLUGIN_ROOT}`（Codex）或 `${CLAUDE_PLUGIN_ROOT}`（Claude）必须解析为真实插件根；不要把多个命令串在一起。

```bash
node "${PLUGIN_ROOT}/dist/cli/project-init.mjs" artifacts/pptx/quarterly-review
node "${PLUGIN_ROOT}/dist/cli/project-lint.mjs" artifacts/pptx/quarterly-review
node "${PLUGIN_ROOT}/dist/cli/project-render.mjs" artifacts/pptx/quarterly-review
node "${PLUGIN_ROOT}/dist/cli/project-probe.mjs" artifacts/pptx/quarterly-review
node "${PLUGIN_ROOT}/dist/cli/project-review.mjs" artifacts/pptx/quarterly-review /absolute/path/outside-project/review-input.json
node "${PLUGIN_ROOT}/dist/cli/project-release.mjs" artifacts/pptx/quarterly-review
```

Hook 对精确 wrapper argv 签发 30 秒、一次性、session/source-bound capability；render、probe、review、release 没有有效 capability 时 fail closed。直接 shell 写入、命令链、重定向、变量替换、symlink 绕过和 community Skill 自带 writer 都不会获得写权限。

render 通过 PptxGenJS 生成 PPTX，再用 LibreOffice 由该 PPTX 导出 PDF，并用 Poppler 渲染逐页 PNG。probe 检查受限 OOXML ZIP、内部 relationship、manifest/PDF/PNG 页数映射、设计系统哈希、对比度和无障碍声明。review 必须来自不同 session，并覆盖当前每一页哈希。release 只签发已经通过上游门禁的闭包。

## 失败恢复

- source/design 变化：从 lint 重新执行完整下游链。
- `PPTX_*`、`PDF_*`、`PNG_*`、`PAGE_MAPPING_INVALID`：修复 source 或工具链，再 render。
- `DESIGN_*`、`ACCESSIBILITY_*`：修复 `design.system.json`、manifest 或 slide source，再 lint → render → probe。
- `SELF_REVIEW_DENIED`、`REVIEW_*`：换独立 reviewer 或修订 source；producer 不能自审关闭。
- `WRITER_CAPABILITY_*`：由 Hook 重新批准精确 wrapper 调用；不要手写 grant。
- `MUTATION_JOURNAL_OPEN`：检查中断 writer 与半成品，确认没有活动进程后从最早受影响阶段恢复。

## 维护验证

Host 可运行 unit tests、静态检查和 honesty gates。调用 Claude/Codex 的 live acceptance 必须使用 `./scripts/acceptance/run.sh` 进入 `docker/host-acceptance`，不能在 host 直接跑 live session。

```bash
npx tsx --test plugins/presentation-production/tests/*.test.ts
npm run typecheck
npm run build
npm run check:dist
```

`tests/pipeline.test.ts` 在具备 LibreOffice/Poppler 时真实执行 init → lint → render → probe → 独立 session review → release；普通 host 缺少 LibreOffice 时会明确 skip，`docker/host-acceptance` 镜像中则应执行而不是跳过。
