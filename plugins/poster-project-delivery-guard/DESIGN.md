# Poster Project Delivery Guard 设计

## 工程合同

工程根为 `artifacts/poster/<poster-id>/`，渲染链固定为 React/TSX → Satori SVG → resvg PNG。`src/variants/manifest.json` 定义规格；variant 目录固定为 `NNN-slug`。每个 variant 的 `layers/manifest.json` 是唯一叠放顺序，第一层必须是 `background`。

layer 文件为 `NNN-<role>-slug.tsx`，role 只能是 background、media、overlay、decoration、title、body、metadata、brand 或 cta。一个 layer 只导出一个 `buildLayer`，不能自行设置 `zIndex`、调用 Satori/resvg、访问 I/O/网络、使用 React client hook 或导入 sibling layer。

每层必须同时有 `<stem>.<source-sha256>.svg` 与 `.png`。release 为 manifest 中每个 variant 生成 `dist/<poster-id>.<variant-id>.png`，并包含 accessibility、review、release manifest 与 receipt。

## Hook 与 writer

Pre Hook 保护逐层 proof、dist/evidence/review/receipt，并拒绝 artifact scope 内未知 shell writer。Post/Failure/Stop 重算实际 variant 与 layer 闭包。

`project-lint.mjs` 从 poster root 解析本地 ESLint/parser，强制私有 owner rule。`project-release.mjs` 先验证所有 layer proof 和 variant 输出，再以独占 journal 原子签发 receipt。receipt 使用文件原始字节哈希；主题、数据或 layer 变化会使旧 receipt 失效，并发 writer 会被 journal 拒绝。

## 边界

合同能证明层序、role、纯 layer owner、成对 proof 与交付 freshness，不能仅靠 AST 判断 Satori 的全部 CSS 支持、字体真实 glyph、组合遮挡或视觉品味。这些结果必须由项目渲染/审查流程写入具名 evidence；插件只阻止缺闭包时 release。

`ui-ux-pro-max` 是固定 commit 的可选知识依赖，不是 renderer 或证据签发者。
