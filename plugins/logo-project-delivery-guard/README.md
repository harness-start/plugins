# Logo Project Delivery Guard

`logo-project-delivery-guard` 保护 Logo 工程，不把范围扩张为完整 VI。它建立 concept source → master render → construction/preview/review → release receipt 的可验证链，拒绝只靠文件名、空壳图片、schema 桩或伪造 wrapper 完成交付。

Fibonacci / φ 检查证明的是可复算、绑定当前 master 的构造关系；它不表示黄金比例构造必然更美，也不证明商标可注册。

## 工程契约

`plan.contract.json` 必须绑定项目和 `source` 或 `release` 阶段。概念文件使用 `NNN-slug.logo.tsx`，concept id 与 source 必须唯一，`logo.project.json` 必须精确选择其中一个概念。注册 renderer 生成带 source SHA-256 的真实 PNG。

master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，每个文件只导出同名原生 SVG component。built master 必须是带 `viewBox` 和可渲染 vector geometry 的自包含 SVG；无效 path data、无尺寸 primitive、固定 width/height、raster、text、远程资源或运行期 I/O 都会被拒绝。

### Source 阶段

- `standard-grid.json` 绑定当前 master digest，并声明正 unit、clear space 与 minimumPixels。
- `geometry.json` 为三个 master role 映射实际 SVG primitive id；mapping 和 primitive id 必须唯一，参数必须是有限数值。
- `fibonacci.json` 使用 `[1,1,2,3,5,8,13]`，保留与 mapped primitive 绑定的 anchor，并声明正 `unit`、至少 3 个命名 circles、相邻 Fibonacci 半径、非同心且几何相接的 `fibonacci-quarter-arcs` spiral，以及 outline/negative-space/turn path bindings。
- mark SVG 必须实际实现声明圆的圆心或圆周关系。
- standard、geometry、fibonacci 三套 SVG/PNG construction sheet 绑定当前 master digest；PNG 会校验 signature、chunk CRC、IDAT 解压长度与 IEND。
- construction manifest 绑定全部制图页原始字节。

### Release 阶段

Release 在 Source 闭包之上还必须包含：

- primary/mono/reverse 的 mark、wordmark、lockup SVG，以及 primary PNG；
- accessibility、approved review 与 release manifest；
- 绑定 master digest 的 preview strip 和 manifest，覆盖 16/32/64、black/mono 与 reverse；
- squint JSON 使用实测 `box-blur-threshold-connected-components`，绑定 strip digest、真实 bbox 和每格指标；
- `singleMemoryPoint`、`opticalCraft`、`markWordmarkSystem` 均达到 `requiredMin`，并记录实质说明；
- receipt 同时绑定 source、master、construction、preview、review 和最终输出。

## 注册工具工作流

项目 `package.json` 必须提供 `logo:render`。这是项目自有、受信任的可执行配置边界；它可以读取项目源码并生成文件，但输出仍须通过格式、关系、manifest 和 digest 校验。

按顺序使用 `project-render.mjs`、`project-validate.mjs`、`project-preview.mjs`、`project-stage.mjs`、`project-release.mjs` 完成生成、实测预览、单调升级和 receipt 签发。

`project-preview.mjs` 在插件内构建多尺寸黑稿/反白稿条带，通过 FFmpeg 栅格化为真实 PNG，再做 squint 分析；它不查找外部 Skill，也不会自动伪造通过的审美分数。运行环境需提供支持 SVG 输入的 FFmpeg；非标准安装位置可通过 `LOGO_PREVIEW_RENDERER` 指定可执行文件。仓库规定的 host-acceptance 容器已包含该运行时。

标志质量复核、定制字形制作和视觉证据判读是可选的上游或人工能力，不是本插件的运行时依赖。插件只校验进入工程契约的产物和证据，不声称替代这些专业判断。

`project-render.mjs` 与 `project-release.mjs` 使用独占 journal；失败会保留 journal 并阻止 Stop。已有 plan 不能通过普通编辑工具删除或降级，只能使用 `project-stage.mjs` 单调升级。

## Hook 与边界

Hook 采用 fail-closed shell policy：Logo scope 只允许窄化的只读命令，或参数形状精确匹配的 `project-lint`、`project-render`、`project-stage`、`project-preview`、`project-validate`、`project-release`。

注册工具只能指向 workspace 内已发现、非 symlink 的 Logo 项目实体目录。路径伪装的同名二进制、`rg --pre`、可写 `sed`/`find`、wrapper 路径仅作为普通参数、`node -e`、compound shell 和畸形 hook JSON 都不会放行。没有 Logo 项目的普通会话不受这组 shell allowlist 影响。

Hook、receipt 和形式化几何都不能证明商标可注册、独创性或市场识别度；这些结论必须由人工或法律审查承担。

## 验证

```bash
node --test plugins/logo-project-delivery-guard/tests/*.test.mjs
```

Claude/Codex live 验收只允许在 `docker/host-acceptance` 容器内运行，见根目录 `AGENTS.md` 与 `docs/host-acceptance.md`。
