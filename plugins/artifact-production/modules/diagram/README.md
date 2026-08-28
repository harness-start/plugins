# 图表项目交付守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `artifact-production` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`diagram-production` 把流程图、架构图、数据图与 PPT 图示统一为 `artifacts/diagram/<id>/` 下的可复现项目。语义 JSON 是事实源；确定性 Scene IR 生成自包含 SVG、PNG、HTML 与可选 `.drawio`，随后由 probe、独立 review、release manifest 和 receipt 逐层绑定。

支持 27 类：`architecture`、`it-current-state`、`flowchart`、`sequence`、`state-machine`、`er`、`timeline`、`swimlane`、`quadrant`、`radar`、`loop`、`nested`、`tree`、`org-chart`、`layer-stack`、`venn`、`pyramid`、`bar`、`line`、`gantt`、`scatter`、`high-level`、`process`、`medallion`、`data-flow`、`dp-integration`、`dp-security-matrix`。

## 目标

把图表语义、布局、渲染、探测、独立审查与发布绑定为可复现工程，避免只改扩展名、提交空图、复用旧 evidence 或绕过 writer 直接修改交付物。静态产物可以进入文档或演示文稿，同时保留可追溯的语义事实源。

## 实现

`diagram-project-authoring` 组织建模和生产，`diagram-visual-critique` 提供视觉建议，`diagram-project-review` 负责独立审查。CLI 将语义 JSON 或受限输入转换为确定性 Scene IR，再生成自包含 SVG、PNG、HTML 和可选 `.drawio`。Hook 对精确 writer 命令签发一次性 capability，并在 `Stop` 按目标阶段重算 evidence 与 receipt。

## 流水线

```bash
node "${PLUGIN_ROOT}/dist/cli/project-init.mjs" artifacts/diagram/request-flow
node "${PLUGIN_ROOT}/dist/cli/project-import.mjs" artifacts/diagram/request-flow /absolute/source.mmd
node "${PLUGIN_ROOT}/dist/cli/project-lint.mjs" artifacts/diagram/request-flow
node "${PLUGIN_ROOT}/dist/cli/project-render.mjs" artifacts/diagram/request-flow
node "${PLUGIN_ROOT}/dist/cli/project-probe.mjs" artifacts/diagram/request-flow
node "${PLUGIN_ROOT}/dist/cli/project-review.mjs" artifacts/diagram/request-flow /absolute/review-input.json
node "${PLUGIN_ROOT}/dist/cli/project-release.mjs" artifacts/diagram/request-flow
```

Codex 脚本由 Hook 注入 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM`。mutation writer 只有在精确命令通过 PreToolUse 后才取得一次性 capability；直接写 `dist/`、evidence、review、release 或 receipt 会被拒绝。Stop 根据 `plan.contract.json.targetStage` 检查闭环，而不是把 Skill 加载或多一轮模型调用当作完成证据。

初始化器固定安装 `elkjs@0.12.0`、`@resvg/resvg-js@2.6.2`、`@fontsource/noto-sans-sc@5.3.0` 与 `@fontsource/noto-serif-sc@5.3.0`。Mermaid 仅接受声明的有限 grammar；draw.io 输入受字节数、解压后大小、XML 深度和危险内容限制，且不会访问外链。v1 只产生静态图。

## 验证

```bash
npx tsx --test plugins/diagram-production/tests/*.test.ts
npm run check:dist
```

任何 Claude Code / Codex live acceptance 必须走仓库的 Docker host-acceptance 入口。
