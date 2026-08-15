# PPTX Project Delivery Guard

`pptx-project-delivery-guard` 管 `artifacts/pptx/<deck-id>/` 下用 PptxGenJS 做的工程。它查连续 slide manifest、单页模块 owner、source-hash 预览、PPTX/PDF/逐页图片、审查文件，以及 release receipt 还新不新。

它不判断 deck 好不好讲，也不自带 PptxGenJS renderer、PDF 转换器或 reviewer。预览和 evidence 由项目流水线生成；插件核对结构，并把当前输入输出字节绑到 receipt。

## 最小目录

```text
artifacts/pptx/quarterly-review/
  .gitignore
  package.json
  package-lock.json
  plan.contract.json
  plan.storyboard.json
  pptx.project.json
  src/
    deck.ts
    theme.ts
    slides/
      manifest.json
      001-opening.ts
      001-opening.<source-sha256>.png
  dist/
    quarterly-review.pptx
    quarterly-review.pdf
    pages/001.png
  evidence.structure.json
  evidence.accessibility.json
  review.pptx.json
  release.manifest.json
  receipt.release.json
```

`src/slides/manifest.json` 是唯一页序。slide 文件必须为连续编号的 `NNN-slug.ts`，并且只导出一个 `renderSlide`。slide 只能修改传入页，不能创建 deck/page、写文件、访问网络、读取墙钟或随机数，也不能导入 sibling slide。

## 生成 preview 和 evidence

项目 renderer 应按 manifest 渲染每页，并对 slide 源文件原始字节计算小写 SHA-256，将单页预览命名为 `NNN-slug.<sha256>.png`。完整 deck 还应生成：

- `dist/<deck-id>.pptx` 和 `dist/<deck-id>.pdf`；
- 与 manifest 页序对应的 `dist/pages/NNN.png`；
- 实际结构探测结果 `evidence.structure.json`；
- 无障碍检查结果 `evidence.accessibility.json`；
- 具名审查结论 `review.pptx.json`；
- 列出交付角色的 `release.manifest.json`。

当前插件会检查这些路径并将其原始字节纳入 receipt，但不会校验 evidence/review JSON 的业务 schema，也不会确认所有 `dist/pages/*.png` 与 slide 一一对应。不要用空 JSON 或占位图片冒充审查结果。

slide preview、`dist/`、evidence、review 和 manifest 是受保护路径。当前只登记 lint 与 release 工具，没有 render/review writer；已启用 Hook 的 agent 不能直接生成这些文件。应由安装前或宿主外的受信任项目流水线生成，然后使用插件校验和签发。`project-release.mjs` 只创建 receipt。

## 校验与发布

```bash
node plugins/pptx-project-delivery-guard/dist/cli/project-lint.mjs artifacts/pptx/quarterly-review
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-manual}" AI_EXPERTS_TRIGGER_FROM="pptx-project-delivery-guard:manual-release" node plugins/pptx-project-delivery-guard/dist/cli/project-release.mjs artifacts/pptx/quarterly-review
```

lint 从 artifact 本地加载 ESLint，因此干净环境需先按 `package-lock.json` 安装依赖。release 校验交付闭包后，通过 `.pptx-delivery-journal.json` 独占写入 `receipt.release.json`。主题、deck owner、manifest、素材、字体、配置或输出变化都会使 receipt 失效。

## 失败恢复

- `PREVIEW_MISSING`：重新渲染 finding 指向的 slide，使用当前源码 SHA-256 命名；不要重命名旧图片。
- `SLIDE_*`：修复 manifest、文件名或单页 owner 边界，再运行 lint。
- `RELEASE_PATH_MISSING`：让项目流水线生成缺少的 deck、PDF、页面图或 evidence。
- `RECEIPT_INVALID`：输入或输出在签发后变化；重建受影响输出并重新签发。
- `MUTATION_JOURNAL_OPEN`：确认没有活跃 writer，检查半写入 receipt；在停用本插件 Hook 的维护窗口清理本项目 journal/临时文件，然后从 lint 重新开始。
- `PROTECTED_WRITER_REQUIRED` 或 `UNKNOWN_MUTATION_SHELL` 表示写入没有执行；不要重复相同命令，改用受信任项目流水线或登记工具。

## 宿主差异与验证

Claude Code 使用 `CLAUDE_PLUGIN_ROOT` 并提供 `PostToolUseFailure`；Codex 使用 `PLUGIN_ROOT`，Hook 命令设置 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM`。安装态调用 writer 时须使用对应变量或已安装插件的精确绝对路径，不能使用 `...` 占位。两者都在 Stop/SubagentStop 重算项目闭包。Hook 只约束宿主可观察的 Tool，不是操作系统沙箱。

```bash
npx tsx --test plugins/pptx-project-delivery-guard/tests/*.test.ts
```

`skill-deps.json` 声明的可选设计顾问只提供只读建议，不能写 preview、dist、evidence 或 receipt。
