# Diagram Project Delivery Guard

`diagram-production` 把流程图、架构图、数据图与 PPT 图示统一为 `artifacts/diagram/<id>/` 下的可复现项目。语义 JSON 是事实源；确定性 Scene IR 生成自包含 SVG、PNG、HTML 与可选 `.drawio`，随后由 probe、独立 review、release manifest 和 receipt 逐层绑定。

支持 27 类：`architecture`、`it-current-state`、`flowchart`、`sequence`、`state-machine`、`er`、`timeline`、`swimlane`、`quadrant`、`radar`、`loop`、`nested`、`tree`、`org-chart`、`layer-stack`、`venn`、`pyramid`、`bar`、`line`、`gantt`、`scatter`、`high-level`、`process`、`medallion`、`data-flow`、`dp-integration`、`dp-security-matrix`。

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
