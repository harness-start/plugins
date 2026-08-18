# Interface Craft

`interface-craft` 做通用界面视觉工艺：先读取现有品牌、token、组件、截图和 `DESIGN.md`，再决定视觉方向和设计系统延续方式，最后检查层级、对比、排版、间距、状态、动效与反模式。

插件仍只有三个顶层 Skill：`$interface-craft` 按需读取方向、设计系统、参考分析和动效方法，`$interface-craft-floor` 约束写入前的最低质量，`$interface-visual-critique` 做只读审查。新界面或实质性改版形成可复用决定时，`$interface-craft` 在项目根 `DESIGN.md` 的 `interface-craft:system` 托管块中记录证据、方向、语义 token、组件状态、响应式/动效合同和验证状态；局部修复与只读审查不创建该资产，托管块也不是 Hook 前提或完成回执。

完成界面编辑后，在项目已有运行条件允许时，应渲染桌面和移动视口并根据截图做一次有界修正；没有渲染条件时必须明确哪些视觉结论未经验证。只读审查的每个 finding 都要给出 `blocker | major | minor`、负责代码的 `file:line`、证据、实际代价、可验证修复/恢复路径和验证状态，最终 verdict 只能是 `approved`、`changes_required` 或 `unverified`。

PostToolUse 只对声明的 Web 风格 UI 扩展名（CSS/SCSS/HTML/JSX/TSX/Vue/Svelte/Astro）做机械检测；Stop 只复扫本会话改过的 UI 文件并去重。新增的 `TRANSITION_ALL` 与 `FOCUS_OUTLINE_REMOVED` 和既有五项检查一样，只报告当前源码事实，不判断设计方向，也不声称已修复。原生 App 工艺仍由 Skill 判断或对应领域插件的机械检查负责。解析失败 fail-open，不阻断会话。

本插件不写海报、PPTX、Remotion 或 logo 制品，也不替代 `web-frontend-engineering` 的语法/lockfile 门禁。图片生成只在宿主已提供对应能力时作为可选参考分支，发布插件不依赖它。其他生产插件不得运行时依赖本插件。Hook 命中、源码符合规则、`DESIGN.md` 存在或截图生成成功都不能单独证明界面质量。
