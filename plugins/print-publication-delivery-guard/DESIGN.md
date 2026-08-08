# Print Publication Delivery Guard 设计

## 工程合同

工程根为 `artifacts/print/<publication-id>/`，只覆盖印刷体手册、目录册和杂志式出版物。建议工程链为 React/TSX 静态 HTML → Vivliostyle → PDF；插件不接受 SPA/client runtime 作为出版页面。

`src/publication.manifest.json` 是唯一章节序。section 文件为 `NNN-slug.section.tsx`，index 必须唯一且严格递增；Front/Spine/Back cover 独立。每个 section/cover 只导出一个静态 component，禁止 hooks、hydrate/createRoot、router、I/O、网络和非确定性 API。`src/styles/page.css` 必须包含 `@page`。

release 闭包固定四份 PDF：interior/cover × proof/print，并要求 pdf、fonts、images、pagination、preflight、accessibility evidence、print review、release manifest 和 receipt。PDF 至少经过 magic 检查，不能只把文件改名为 `.pdf`。

## Hook 与 writer

Hook 保护 `build/html/`、dist/evidence/review/receipt，并拒绝 artifact scope 内未知 mutation shell。ESLint preset 处理静态 React owner；manifest、Paged Media 和 PDF 角色由跨文件合同处理。

`project-release.mjs` 在四份 PDF 与全部 evidence 就绪后，以 `.print-delivery-journal.json` 独占并原子签发 receipt，绑定源码/config 与输出原始字节。任何版式 CSS、章节、字体/素材或 PDF 变化都会使旧 receipt 失效。

## 边界

PDF magic 不是 PDF/X 或可印刷证明。Trim/Bleed boxes、字体嵌入、DPI、色彩 profile、总墨量、脊宽和印厂约束必须由项目的 Vivliostyle/preflight 流程及具名 printer profile 产生 evidence。插件当前只强制 evidence 角色和 freshness，不冒充印厂签字。当前没有外部 Skill 依赖。
