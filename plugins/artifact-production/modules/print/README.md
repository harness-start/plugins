# 印刷出版项目交付守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `artifact-production` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`print-publication-production` 管 `artifacts/print/<publication-id>/` 下的手册、目录册和杂志。它查静态 React 出版单元、章节顺序、Paged Media CSS、四种 PDF 交付角色、preflight evidence，以及 release receipt 还新不新。

文件叫 `.pdf` 不等于能印。插件不自带 Vivliostyle renderer 或 preflight 工具。HTML、PDF 和 evidence 由项目流水线生成；插件核对结构、PDF magic 和最终字节。

## 目标

为手册、目录册和杂志建立章节、Paged Media CSS、四类 PDF、字体/图片/分页/印前 evidence、独立 review 与 receipt 的交付合同。插件阻止空文件或改扩展名冒充 PDF，但不替代印厂 profile、设备能力与签字确认。

## 实现

项目的静态 React 出版单元与 manifest 是事实源，外部受信任流水线负责 HTML、proof/print PDF 和实际 preflight evidence；本插件没有登记 render/preflight writer。Hook 保护 `build/html/`、`dist/`、evidence、review 与 manifest，`project-lint.mjs` 校验结构，`project-release.mjs` 在四份 PDF、六份 evidence、独立 review 和 manifest 全部当前有效时签发摘要 receipt。

## 最小目录

```text
artifacts/print/field-manual/
  .gitignore
  package.json
  package-lock.json
  plan.contract.json
  plan.assets.json
  print.project.json
  tsconfig.json
  vivliostyle.config.js
  src/
    render.tsx
    publication.manifest.json
    cover/{Front,Spine,Back}.cover.tsx
    sections/010-intro.section.tsx
    styles/{tokens,page,components,publication}.css
  build/html/
  dist/
    field-manual.interior.proof.pdf
    field-manual.interior.print.pdf
    field-manual.cover.proof.pdf
    field-manual.cover.print.pdf
  evidence/{pdf,fonts,images,pagination,preflight}.json
  evidence.accessibility.json
  review.print.json
  release.manifest.json
  receipt.release.json
```

`src/publication.manifest.json` 是唯一章节序。section 使用 `NNN-slug.section.tsx`，index 必须唯一且严格递增；Front、Spine、Back cover 相互独立。每个出版单元只导出静态 component，禁止 client Hook、hydrate/createRoot、router、I/O、网络和非确定性 API。`src/styles/page.css` 必须包含 `@page`。

## 生成 proof 和 evidence

项目自己的静态渲染链应按以下顺序执行：

1. 从 React/TSX 和 Paged Media CSS 生成静态 HTML；
2. 用 Vivliostyle 或等价工具分别生成 interior/cover 的 proof 与 print PDF；
3. 用实际探测器写入 PDF 结构、字体、图片、分页、印前检查和无障碍 evidence；
4. 由具名 reviewer 写 `review.print.json`，并在 `release.manifest.json` 列出本次交付角色。

六份 evidence 都必须使用各自的 `print-publication-production/*-evidence/v1` schema，绑定当前 `artifactId` 与 `subjectDigest`，给出 `verdict: "pass"` 和非空 passing checks。字体 evidence 还必须证明字体嵌入、字形覆盖，并按排版角色记录字号、行高、字距和最大行长；分页 evidence 必须给出正页数并通过 `widows-orphans`；preflight evidence 必须记录 printer profile。Trim/Bleed box、DPI、色彩 profile、总墨量和脊宽等项目仍应作为实际检查写入，但插件不代替印厂签字。

`review.print.json` 使用 `review/v2`：reviewer session 必须独立于发布 session，coverage 必须逐字节绑定当前四份 PDF 和六份 evidence，并明确通过 `typography`、`pagination`、`preflight`。`release.manifest.json` 使用 `release-manifest/v2` 并覆盖同一组当前 digest；修改 PDF 或重新签发 evidence 都会让旧 review 和 manifest 失效。

受保护的 `build/html/`、`dist/`、evidence、review 和 manifest 只能由登记 writer 写入；当前插件没有登记 render/preflight writer。已启用 Hook 的 agent 不能直接生成这些文件，应由安装前或宿主外的受信任项目流水线生成。`project-release.mjs` 只生成 receipt。

## 校验与发布

```bash
node plugins/print-publication-production/dist/cli/project-lint.mjs artifacts/print/field-manual
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-manual}" AI_EXPERTS_TRIGGER_FROM="print-publication-production:manual-release" node plugins/print-publication-production/dist/cli/project-release.mjs artifacts/print/field-manual
```

lint 使用 artifact 本地 ESLint/parser，干净环境需先按 `package-lock.json` 安装依赖。release 要求四份 PDF 都以 `%PDF` 开头、六份业务 evidence 当前有效、独立 review 与 manifest 完整覆盖，然后通过 `.print-delivery-journal.json` 原子签发 receipt。章节、CSS、字体、素材、配置、evidence 或输出的任何变化都会使旧 review、manifest 或 receipt 失效。

## 失败恢复

- `PUBLICATION_UNIT_*` 或 `SECTION_*`：修复 manifest、文件名或静态 owner 边界，再运行 lint。
- `RELEASE_PATH_MISSING`：让项目流水线补齐 finding 指向的 PDF 或 evidence，不要用空文件通过路径检查。
- `PDF_MAGIC_INVALID`：重新生成真正的 PDF；改扩展名无效。
- `RECEIPT_INVALID`：重新生成受影响输出并重新签发。
- `MUTATION_JOURNAL_OPEN`：确认没有活跃 writer，检查半写入 receipt；在停用本插件 Hook 的维护窗口清理本项目残留 journal/临时文件，然后从 lint 重启。
- 写入被 `PROTECTED_WRITER_REQUIRED` 或 `UNKNOWN_MUTATION_SHELL` 拒绝时，命令没有执行；改用受信任项目流水线或已登记工具。

## 宿主差异与验证

Claude Code 使用 `CLAUDE_PLUGIN_ROOT` 并观察 `PostToolUseFailure`；Codex 使用 `PLUGIN_ROOT`，由 Hook 命令补充 provenance 环境变量。安装态调用 writer 时须使用对应变量或已安装插件的精确绝对路径，不能使用 `...` 占位。两者都会在 Stop 重算交付闭包，但 Hook 只能约束宿主可观察的工具调用，不是操作系统沙箱。

```bash
npx tsx --test plugins/print-publication-production/tests/*.test.ts
```

当前没有外部 Skill 依赖。
