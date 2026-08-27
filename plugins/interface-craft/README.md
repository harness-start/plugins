# 界面视觉工艺

`interface-craft` 面向 Web 页面、后台、应用界面和设计系统的视觉实现与审查。它先读取现有品牌、token、组件、截图和 `DESIGN.md`，再确定视觉方向并检查层级、对比、排版、间距、状态、动效与常见反模式。

## 目标

- 在新界面或实质改版中形成与现有产品连续、可实现、可复查的视觉方向。
- 为局部 UI 修改提供最低工艺约束，避免明显的可访问性和交互状态缺失。
- 通过只读审查给出带严重级别、源码锚点、证据和验证方法的 finding。
- 用 Hook 报告可机械定位的源码反模式，同时不把规则命中或未命中冒充视觉质量结论。

## 实现

插件只有三个顶层 Skill：

- `interface-craft`：主入口，按需读取视觉方向、设计系统、参考分析和动效方法；
- `interface-craft-floor`：写入前的最低质量合同；
- `interface-visual-critique`：不修改文件的视觉审查。

新界面或实质改版产生可复用决定时，主入口在项目根 `DESIGN.md` 的 `interface-craft:system` 托管块记录证据、方向、语义 token、组件状态、响应式/动效合同和验证状态。局部修复与只读审查不创建该资产，托管块也不是 Hook 前提或完成回执。

`SessionStart` 提供短路由；`PostToolUse` 只扫描本次观察到的 CSS、SCSS、HTML、JSX、TSX、Vue、Svelte 与 Astro 文件；`Stop` 复扫本会话改过的 UI 文件并去重。机械检查包括既有五项规则以及 `TRANSITION_ALL` 和 `FOCUS_OUTLINE_REMOVED`。解析失败 fail-open，检查只报告，不自动改写或回滚。

## 推荐流程

1. 读取当前品牌、token、组件和页面证据，区分新设计与延续性修改。
2. 用 `interface-craft` 确定方向、语义色、排版、间距、状态、响应式和动效合同。
3. 写入前使用 `interface-craft-floor` 检查最低质量要求。
4. 在项目已有运行条件允许时，渲染桌面和移动视口并根据截图做一次有界修正。
5. 需要独立审查时使用 `interface-visual-critique`；每条 finding 标注 `blocker`、`major` 或 `minor`，并给出 `file:line`、实际代价、修复/恢复路径和验证状态。

没有渲染条件时必须明确哪些视觉结论未经验证。审查 verdict 只能是 `approved`、`changes_required` 或 `unverified`。

## 边界与验证

本插件不生成海报、PPTX、Remotion 视频或 Logo，也不替代 `web-frontend-engineering` 的语法和 lockfile 门禁。原生 App 的机械规则由对应领域插件拥有。图片生成仅在宿主提供该能力时作为可选参考，发布包不依赖它。

Hook 命中、源码符合规则、`DESIGN.md` 存在或截图生成成功，都不能单独证明界面质量。

```bash
npx tsx --test plugins/interface-craft/tests/*.test.ts
./scripts/acceptance/run.sh --plugin interface-craft
```

live acceptance 由脚本进入 `docker/host-acceptance`。版本：`0.3.0`。
