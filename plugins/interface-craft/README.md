# Interface Craft

`interface-craft` 做通用界面视觉工艺：先读取现有品牌、token 与组件，再决定视觉方向和设计系统延续方式，最后检查层级、对比、排版、间距、状态、动效与反模式。

插件仍只有三个顶层 Skill：`$interface-craft` 按需读取方向、设计系统和动效参考，`$interface-craft-floor` 约束写入前的最低质量，`$interface-visual-critique` 做只读审查。完成界面编辑后，在项目已有运行条件允许时，应渲染桌面和移动视口并根据截图做一次有界修正；没有渲染条件时必须明确哪些视觉结论未经验证。

PostToolUse 对声明的 UI 扩展名做机械检测；Stop 只复扫本会话改过的 UI 文件并去重。解析失败 fail-open，不阻断会话。

本插件不写海报、PPTX、Remotion 或 logo 制品，也不替代 `web-frontend-engineering` 的语法/lockfile 门禁。其他生产插件不得运行时依赖本插件。Hook 命中、源码符合规则或截图生成成功都不能单独证明界面质量。
