# Logo Project Delivery Guard 设计

## 工程合同

工程根为 `artifacts/logo/<logo-id>/`，范围只覆盖 Logo，不扩张到完整 VI。概念文件使用 `NNN-slug.logo.tsx` 并带同目录 source-hash PNG。master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，各自只导出一个原生 SVG component。

master SVG 必须自包含、使用 `viewBox`，不能含固定 width/height、image、text、foreignObject、script/style、远程资源或运行期 I/O。`build/master/{mark,wordmark,lockup}.svg` 是几何制图事实源。

验收同时要求：

- `standard-grid.json` 有正 unit、clear space 和最小尺寸；
- `geometry.json` 把 master path 映射到稳定几何 primitive；
- `fibonacci.json` 明示序列 `1,1,2,3,5,8,13`、用途 `structural|optical-reference`，并至少映射两个 outline anchor 和一个 negative-space/turn anchor；
- standard、geometry、fibonacci 三套 SVG/PNG 制图页的文件名绑定当前 master digest。

release 输出 primary/mono/reverse 的 mark、wordmark、lockup 矩阵，以及 accessibility、review、manifest 和 receipt。

## Hook 与 writer

Hook 保护 concept preview、master build、construction evidence、dist/review/receipt，并拒绝 artifact scope 内未知 mutation shell。ESLint rule 约束 master 的单 component/native vector owner；跨文件几何与 Fibonacci 关系由合同校验。

`project-release.mjs` 通过独占 journal 原子签发 source/output receipt。修改 master、construction JSON 或任一最终文件都会使旧 receipt 失效。

## 边界

Fibonacci 验收证明“构造关系有可复现声明”，不证明黄金比例必然更美。Hook 也不能证明商标可注册、独创性或市场识别度；这些必须由人工/法律审查承担。当前插件没有外部 Skill 依赖。
