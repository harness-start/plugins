# Interface Craft

`interface-craft` 做通用界面视觉工艺：层级、对比、反模式。薄编排入口是 `$interface-craft`，业务方法是 `$interface-craft-floor` 与 `$interface-visual-critique`。

PostToolUse 对声明的 UI 扩展名做机械检测；Stop 只复扫本会话改过的 UI 文件并去重。解析失败 fail-open，不阻断会话。

本插件不写海报、PPTX、Remotion 或 logo 制品，也不替代 `web-frontend-engineering` 的语法/lockfile 门禁。其他生产插件不得运行时依赖本插件。
