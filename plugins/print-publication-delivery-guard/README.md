# Print Publication Delivery Guard

`print-publication-delivery-guard` 保护 `artifacts/print/<publication-id>/` 下的印刷手册、目录册和杂志式出版物。它校验严格递增的 section manifest、静态 React 出版单元、封面 role、Paged Media CSS、受保护的 HTML/PDF/page writer、四种 proof/print PDF role 和 preflight evidence。

插件不把 PDF/X 文件名当作证据。release 校验会检查 PDF magic，并要求明确的 preflight 和 review artifact。

## 工程契约

建议生成链为 React/TSX 静态 HTML → Vivliostyle → PDF；插件不接受 SPA/client runtime 作为出版页面。

`src/publication.manifest.json` 是唯一章节序。section 文件为 `NNN-slug.section.tsx`，index 必须唯一且严格递增；Front/Spine/Back cover 相互独立。每个 section/cover 只导出一个静态 component，禁止 Hook、hydrate/createRoot、router、I/O、网络和非确定性 API。`src/styles/page.css` 必须包含 `@page`。

release 闭包固定为 interior/cover × proof/print 四份 PDF，并要求 pdf、fonts、images、pagination、preflight、accessibility evidence、print review、release manifest 和 receipt。PDF 至少经过 magic 检查，不能只将普通文件改名为 `.pdf`。

## Hook、writer 与边界

Hook 保护 `build/html/`、dist/evidence/review/receipt，并拒绝 artifact scope 内未知的修改型 shell。ESLint preset 处理静态 React owner；manifest、Paged Media 和 PDF role 由跨文件契约校验。

`project-release.mjs` 在四份 PDF 与全部 evidence 就绪后，通过 `.print-delivery-journal.json` 独占并原子签发 receipt，绑定源码/config 和输出原始字节。版式 CSS、章节、字体、素材或 PDF 的任何变化都会使旧 receipt 失效。

PDF magic 不能证明 PDF/X 或可印刷。Trim/Bleed box、字体嵌入、DPI、色彩 profile、总墨量、脊宽和印厂约束必须由项目的 Vivliostyle/preflight 流程及具名 printer profile 生成 evidence。插件只强制 evidence role 和 freshness，不冒充印厂签字。当前没有外部 Skill 依赖。

```bash
node --test plugins/print-publication-delivery-guard/tests/*.test.mjs
```
