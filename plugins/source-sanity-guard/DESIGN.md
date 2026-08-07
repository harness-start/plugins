# source-sanity-guard 设计

## 责任边界

插件只负责不依赖外部工具、证据明确的写前源码卫生问题。技术债标记、类型抑制、格式化、语言 lint、依赖目录保护和未解决合并冲突由其他插件负责。

PreToolUse 覆盖 `Edit`、`Write`、`MultiEdit`、`NotebookEdit` 和 `apply_patch`。Shell 命令和 PostToolUse 不在本插件范围内。

## 配置

只从 Git 根目录加载 `.source-sanity-guard.mjs`。这是项目拥有的可信可执行配置，但插件只读取以下数据结构：

```js
{
  checks?: {
    backupArtifact?: "block" | "report" | "off",
    garbledText?: "block" | "report" | "off",
  },
  overrides?: Array<{
    match: RegExp,
    checks: Partial<Record<checkName, "block" | "report" | "off">>,
  }>,
}
```

路径是仓库相对 POSIX 路径。每个检查分别使用第一个同时匹配路径并声明该检查的 override；未匹配时使用 `checks`，再回退到默认值。无效字段警告后回退默认值，配置加载失败不取消内置保护。

## 检查语义

- 备份产物要求路径包含常见源码根目录段，并以 `.bak`、`.backup`、`.old`、`.orig`、`.rej`、`.swp`、`.temp`、`.tmp` 或 `~` 结尾。
- 乱码检查只扫描本次工具输入中的待插入文本。单个 `U+FFFD` 可能是合法内容，不拦截；连续至少两个或累计至少三个才命中。
- 第三方、生成、构建和缓存目录始终跳过，防止扫描不属于项目源码的产物。

`block` 在写前返回 `permissionDecision: deny`。`report` 只注入上下文，不返回失败状态。
