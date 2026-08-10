# Logo Project Delivery Guard

`logo-project-delivery-guard` 保护 `artifacts/logo/<logo-id>/` 下只包含 Logo 的工程，不把范围扩张为完整 VI。它校验概念预览、Mark/Wordmark/Lockup 向量 owner、自包含 master SVG、标准制图和几何输入、**形式化 Fibonacci 圆 / 黄金螺旋构造**、预览条带与眯眼（squint）证据、受保护生成路径与变体闭包。

Fibonacci / φ 检查证明的是**可复算的构造关系**，不是“必然更美”的证书，也不证明商标可注册。

## 工程契约

概念文件使用 `NNN-slug.logo.tsx`，并在同目录提供带 source hash 的 PNG。master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，每个文件只导出一个原生 SVG component。

master SVG 必须自包含并使用 `viewBox`，不能包含固定 width/height、image、text、foreignObject、script/style、远程资源或运行期 I/O。`build/master/{mark,wordmark,lockup}.svg` 是几何制图事实源。

### Source 阶段

- `standard-grid.json`：正 unit、clear space、最小尺寸 ≥16
- `geometry.json`：circle primitive 必须覆盖 `fibonacci.circles[].id`，并有 pathMappings
- `fibonacci.json`（**形式化，拒绝 schema-only 桩**）：
  - `sequence: [1,1,2,3,5,8,13]`
  - `unit` 正数基半径
  - ≥3 个命名 `circles`（`cx/cy/radiusUnits`，radiusUnits ∈ sequence）
  - 至少一个相邻 Fibonacci 半径对（如 5+8、8+13）
  - `spiral.kind = fibonacci-quarter-arcs` 且 `orderedCircleIds` ≥3，邻接步半径相邻且几何 nested/joint
  - `pathBindings`：≥2 outline + ≥1 negative-space|turn，feature 为 `center|rim`
  - **mark SVG 必须实现声明圆**（`<circle>` 或 path 点落在圆心/圆周容差内）
- construction 三套 SVG/PNG 制图页文件名绑定当前 master digest

### Release 阶段（额外）

- dist primary/mono/reverse 矩阵 + accessibility + review + manifest + receipt
- `evidence/preview/strip.<masterDigest>.png` + `.manifest.json`（含 16/32/64，mono+reverse）
- `evidence/preview/squint.<masterDigest>.json`：stripDigest 与 PNG 一致、pass、覆盖 16/32/64
- `review.logo.json`：`singleMemoryPoint` / `opticalCraft` / `markWordmarkSystem` 分数 ≥ requiredMin（默认 2）
- receipt 绑定上述 preview 路径摘要

## 工具

| 工具 | 作用 |
| --- | --- |
| `scripts/tools/project-validate.mjs` | 与 hook 同源的 source/release 校验 |
| `scripts/tools/project-preview.mjs` | 调用 host `logo-preview-strip` 生成条带 + squint + review 绑定 |
| `scripts/tools/project-release.mjs` | 原子 receipt |
| `scripts/tools/project-lint.mjs` | 本地 ESLint owner 规则 |

```bash
node --test plugins/logo-project-delivery-guard/tests/*.mjs
# against a logo project root (workspace path under artifacts/logo/<id>/):
node plugins/logo-project-delivery-guard/scripts/tools/project-validate.mjs <logo-project-root> --stage source
node plugins/logo-project-delivery-guard/scripts/tools/project-preview.mjs <logo-project-root>
node plugins/logo-project-delivery-guard/scripts/tools/project-release.mjs <logo-project-root>
node plugins/logo-project-delivery-guard/scripts/tools/project-validate.mjs <logo-project-root> --stage release
```

## Hook、writer 与边界

Hook 保护 concept preview、master build、construction evidence、preview evidence、dist/review/receipt，并拒绝 artifact scope 内未知的修改型 shell。ESLint rule 约束 master 的单 component/native vector owner。

质量栈依赖宿主已安装的 **logo-design**（`logo-preview-strip`）、**logo-audit**、**lettering-design** 与 visual-evidence 技能；插件不重新实现渲染器。

Hook 不能证明商标可注册、独创性或市场识别度。

Live 验收（Claude/Codex 会话）只允许在 `docker/host-acceptance` 容器内运行，见根目录 `AGENTS.md` 与 `docs/host-acceptance.md`。
