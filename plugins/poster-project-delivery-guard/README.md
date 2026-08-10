# Poster Project Delivery Guard

`poster-project-delivery-guard` 保护 `artifacts/poster/<poster-id>/` 下由 React/TSX、Satori 和 resvg 渲染的海报工程。它校验有序 variant 与 layer、绑定 role 的文件名、纯 layer owner、成对 source-hash SVG/PNG proof、受保护生成路径和必需 release 文件。

插件不认证视觉品味。review evidence 始终与 artifact 绑定，并独立于可选的 `ui-ux-pro-max` 顾问。

## 工程契约

渲染链固定为 React/TSX → Satori SVG → resvg PNG。`src/variants/manifest.json` 定义规格，variant 目录为 `NNN-slug`；每个 variant 的 `layers/manifest.json` 是唯一叠放顺序，第一层必须为 `background`。

layer 文件格式为 `NNN-<role>-slug.tsx`，role 只能是 `background`、`media`、`overlay`、`decoration`、`title`、`body`、`metadata`、`brand` 或 `cta`。每个 layer 只导出一个 `buildLayer`，不能自行设置 `zIndex`、调用 Satori/resvg、访问 I/O 或网络、使用 React client Hook，也不能导入 sibling layer。

每层必须同时有 `<stem>.<source-sha256>.svg` 和 `.png`。release 为 manifest 中每个 variant 生成 `dist/<poster-id>.<variant-id>.png`，并包含 accessibility、review、release manifest 和 receipt。

## Hook、writer 与边界

Pre Hook 保护逐层 proof、dist/evidence/review/receipt，并拒绝 artifact scope 内未知的 shell writer；Post/Failure/Stop 会重算实际 variant 与 layer 闭包。生成路径只能由 `scripts/tools/` 下登记的 wrapper 写入。

`project-lint.mjs` 从 poster root 解析本地 ESLint/parser，并强制私有 owner rule。`project-release.mjs` 先校验全部 layer proof 和 variant 输出，再以独占 journal 原子签发基于原始文件字节哈希的 receipt。主题、数据、layer 变化会使旧 receipt 失效，并发 writer 会被 journal 拒绝。

契约能证明层序、role、纯 layer owner、成对 proof 和交付 freshness，但不能仅凭 AST 判断 Satori 的全部 CSS 支持、字体 glyph、组合遮挡或视觉品味。这些结论必须由项目渲染和 review 流程写入具名 evidence。`ui-ux-pro-max` 是固定 commit 的可选知识依赖，不是 renderer 或证据签发者。

在 marketplace 根目录运行离线测试：

```bash
node --test plugins/poster-project-delivery-guard/tests/*.test.mjs
```
