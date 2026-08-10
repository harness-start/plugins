# PPTX Project Delivery Guard

`pptx-project-delivery-guard` 保护 `artifacts/pptx/<deck-id>/` 下使用 PptxGenJS 构建的工程。硬性 profile 校验路径语法、连续 slide manifest、单页模块 owner、source-hash 预览、受保护生成路径、必需 release 文件，以及绑定 source/output 的 release receipt。

插件不声称 deck 具有说服力或良好视觉质量，这些判断必须保留在 artifact-bound review evidence 中。可选的 `ui-ux-pro-max` 只提供建议，不能写入或发布 artifact。

## 工程契约

生成器固定为 PptxGenJS。`src/slides/manifest.json` 是唯一页序；slide 文件必须为连续编号的 `NNN-slug.ts`，且只导出一个 `renderSlide`。slide 不能创建 deck/page、写文件、访问网络、读取墙钟随机数或导入 sibling slide。

每个 slide 必须有同目录预览 `NNN-slug.<source-sha256>.png`。文件名只证明直接源码匹配；release receipt 还覆盖 theme、deck owner、manifest、素材、字体和配置等非生成输入。

release 闭包要求：

- `dist/<deck-id>.pptx`、`dist/<deck-id>.pdf`、`dist/pages/NNN.png`；
- `evidence.structure.json`、`evidence.accessibility.json`、`review.pptx.json`；
- `release.manifest.json`、`receipt.release.json`。

## Hook 与 writer

- `SessionStart` 有界发现工程；`PreToolUse` 拒绝直接写 slide preview、evidence、review、receipt、release manifest 和 `dist/`，也拒绝 artifact scope 内未知的修改型 shell。
- `PostToolUse` 与 Claude `PostToolUseFailure` 重算有限项目 finding；`Stop` 和 `SubagentStop` 按 `plan.contract.json` 的 `targetStage` 阻断缺口。
- Codex Hook 命令设置 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM`。

`project-lint.mjs` 强制加载插件 preset 和项目本地 ESLint，私有 rule 保护 slide owner 边界。`project-release.mjs` 校验 release 闭包，通过 `.pptx-delivery-journal.json` 独占写入，并签发绑定原始输出字节的 receipt。残留 journal、伪造 receipt 或任何输入/输出变化都会失败。

运行强制项目本地 lint 和原子 release writer：

```bash
node <plugin-root>/scripts/tools/project-lint.mjs artifacts/pptx/<deck-id>
AI_EXPERTS_SESSION_ID=<session> AI_EXPERTS_TRIGGER_FROM=<source> \
  node <plugin-root>/scripts/tools/project-release.mjs artifacts/pptx/<deck-id>
```

## 能证明与不能证明

插件可以机械验证目录、页序、owner、直接源码预览、输出角色、writer 边界和 freshness。结构、无障碍和 review 文件是外部探测器的必需输入，但“文件存在”不等于审美通过；说服力、版面品味和人工 review 结论仍需具名证据。固定在 `skill-deps.json` 的 `ui-ux-pro-max` 只提供构图和视觉知识，不能写 preview、dist 或 receipt。

在 marketplace 根目录运行离线测试：

```bash
node --test plugins/pptx-project-delivery-guard/tests/*.test.mjs
```
