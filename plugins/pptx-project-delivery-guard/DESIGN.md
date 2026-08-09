# PPTX Project Delivery Guard 设计

## 工程合同

工程根为 `artifacts/pptx/<deck-id>/`，生成器固定为 PptxGenJS。`src/slides/manifest.json` 是唯一页序；slide 文件必须为 `NNN-slug.ts`、编号连续，并且只导出一个 `renderSlide`。slide 不能创建 deck/page、写文件、访问网络、读取墙钟随机数或导入 sibling slide。

每个 slide 必须有同目录预览 `NNN-slug.<source-sha256>.png`。这个文件名只证明直接源码匹配；release receipt 另外覆盖 theme、deck owner、manifest、素材、字体和配置等非生成输入。

必需 release 闭包：

- `dist/<deck-id>.pptx`、`dist/<deck-id>.pdf`、`dist/pages/NNN.png`；
- `evidence.structure.json`、`evidence.accessibility.json`、`review.pptx.json`；
- `release.manifest.json`、`receipt.release.json`。

## Hook 与 writer

`SessionStart` 有界发现工程；`PreToolUse` 保护 preview、dist/evidence/review/receipt，并拒绝 artifact scope 内未知 mutation shell；Post/Failure 重算合同；Stop/SubagentStop 按 `targetStage` 阻断缺口。

`scripts/tools/project-lint.mjs` 强制加载插件 preset 和项目本地 ESLint。私有 rule 保证 slide owner 边界。`scripts/tools/project-release.mjs` 检查 release 闭包，以 `.pptx-delivery-journal.json` 独占写入，并签发绑定原始输出字节的 receipt。残留 journal、伪造 receipt 或任一输入/输出变化都会失败。

## 能证明与不能证明

可机械验证目录、页序、owner、直接源码预览、输出角色、writer 边界和 freshness。结构/无障碍/review 文件目前作为外部探测器的必需输入，插件不把“文件存在”提升为审美已通过；说服力、版面品味和人工 review 结论仍需具名证据。

`ui-ux-pro-max` 只提供构图和视觉知识；固定依赖见 `skill-deps.json`，不能写 preview、dist 或 receipt。
