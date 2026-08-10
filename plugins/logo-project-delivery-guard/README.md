# Logo Project Delivery Guard

`logo-project-delivery-guard` 保护 `artifacts/logo/<logo-id>/` 下只包含 Logo 的工程，不把范围扩张为完整 VI。它校验概念预览、Mark/Wordmark/Lockup 向量 owner、自包含 master SVG、标准制图和几何输入、必需的 Fibonacci 构造映射、受保护生成路径与变体闭包。

Fibonacci 检查只能证明与 master 之间存在可复现关系，不表示黄金比例构造必然更美，也不证明商标可以注册。

## 工程契约

概念文件使用 `NNN-slug.logo.tsx`，并在同目录提供带 source hash 的 PNG。master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，每个文件只导出一个原生 SVG component。

master SVG 必须自包含并使用 `viewBox`，不能包含固定 width/height、image、text、foreignObject、script/style、远程资源或运行期 I/O。`build/master/{mark,wordmark,lockup}.svg` 是几何制图事实源。

验收还要求：

- `standard-grid.json` 有正 unit、clear space 和最小尺寸；
- `geometry.json` 将 master path 映射到稳定几何 primitive；
- `fibonacci.json` 明示序列 `1,1,2,3,5,8,13`、用途 `structural|optical-reference`，并至少映射两个 outline anchor 和一个 negative-space/turn anchor；
- standard、geometry、fibonacci 三套 SVG/PNG 制图页的文件名绑定当前 master digest；
- release 输出 primary/mono/reverse 的 mark、wordmark、lockup 矩阵，以及 accessibility、review、manifest 和 receipt。

## Hook、writer 与边界

Hook 保护 concept preview、master build、construction evidence、dist/review/receipt，并拒绝 artifact scope 内未知的修改型 shell。ESLint rule 约束 master 的单 component/native vector owner；跨文件几何与 Fibonacci 关系由契约校验。

`project-release.mjs` 通过独占 journal 原子签发绑定 source/output 的 receipt。修改 master、construction JSON 或任一最终文件都会使旧 receipt 失效。

Hook 不能证明商标可注册、独创性或市场识别度，这些结论必须由人工或法律审查承担。当前插件没有外部 Skill 依赖。

```bash
node --test plugins/logo-project-delivery-guard/tests/*.test.mjs
```
