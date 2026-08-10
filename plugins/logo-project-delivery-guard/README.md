# Logo Project Delivery Guard

`logo-project-delivery-guard` 保护 `artifacts/logo/<logo-id>/` 下只包含 Logo 的工程，不把范围扩张为完整 VI。它建立 source → render → construction/review → release receipt 的可验证链，拒绝只靠文件名、空壳图片或伪造 wrapper 完成交付。

Fibonacci 检查证明的是结构记录明确绑定当前 master path、primitive、坐标和序列值；它不表示黄金比例构造必然更美，也不证明商标可以注册。

## 工程契约

`plan.contract.json` 必须绑定项目和阶段：

```json
{
  "schema": "logo-project-delivery-guard/plan/v1",
  "artifactId": "demo",
  "targetStage": "source"
}
```

概念文件使用 `NNN-slug.logo.tsx`，concept id 与 source 必须唯一，`logo.project.json` 必须精确选择其中一个概念；注册 renderer 生成带 source SHA-256 的真实 PNG。master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，每个文件只导出同名原生 SVG component。

`build/master/{mark,wordmark,lockup}.svg` 必须是带 `viewBox` 和可渲染矢量 geometry 的自包含、结构良好的 SVG；无效 path data、无尺寸 primitive、固定 width/height、image、text、foreignObject、script/style、远程资源或运行期 I/O 都会被拒绝。它们是几何制图事实源。

构造记录必须满足：

- `standard-grid.json` 绑定当前 master digest，并有正 unit、clear space 和最小尺寸；
- `geometry.json` 为三个 master role 映射实际矢量 primitive 上存在的 SVG ID；path mapping、primitive ID 必须唯一，primitive 参数必须是非空有限数值；
- `fibonacci.json` 绑定同一 master/geometry，使用序列 `1,1,2,3,5,8,13`，每个 anchor 都必须指向该 path mapping 自己声明的 primitive，并带坐标和 sequence value；
- standard、geometry、fibonacci 的 SVG 带 master/sheet 元数据，PNG 通过 signature、chunk CRC、IDAT 解压长度和 IEND 校验；
- construction manifest 绑定全部制图页原始字节。

Release 必须包含 primary/mono/reverse 的 mark、wordmark、lockup SVG，primary PNG，以及绑定当前 subject 的 accessibility、approved review 和 release manifest。所有 SVG geometry 必须与对应 built master 一致。

## 注册 writer 工作流

项目的 `package.json` 必须提供 `logo:render`。该脚本是项目自有、受信任的可执行配置边界：它可以读取项目源码并生成文件，但输出仍必须通过插件的格式、关系、manifest 和 digest 校验。插件不会仅因执行这个已声明脚本而把它当成漏洞。

从 source 阶段生成并校验概念、master 和 construction：

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/logo/demo source
```

Source 闭包通过后，只能用单调 stage writer 进入 release；已有 plan 不能用普通编辑工具删除或降级：

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-stage.mjs" artifacts/logo/demo release
```

随后生成 release 输出并签发 receipt：

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/logo/demo release
node "${PLUGIN_ROOT}/scripts/tools/project-release.mjs" artifacts/logo/demo
```

`project-render.mjs` 和 `project-release.mjs` 使用独占 journal；失败会保留 journal 并阻止 Stop。Receipt 绑定全部 source/config、concept previews、built masters、construction sheets/manifest、最终输出和 review evidence。任一字节变化都会使旧 receipt 失效。

## Hook 与边界

Hook 采用 fail-closed shell policy：命令显式触及 Logo scope，或当前 workspace 已存在任一 Logo 项目时，只允许窄化的只读命令或参数形状精确匹配的 `project-lint`、`project-render`、`project-stage`、`project-release`。注册 writer 只能指向 workspace 内已发现、非 symlink 的 `artifacts/logo/<logo-id>` 实体目录；路径伪装的同名二进制、`rg --pre`、可写 `sed`/`find`、wrapper 路径仅作为普通参数、`node -e`、`dd`、`perl`、compound shell 和畸形 hook JSON 都不会放行。没有 Logo 项目的普通会话不受此 shell allowlist 影响。所有 kebab-case Logo 项目都会被检查，不存在静默数量截断。

Hook 和 receipt 不能证明商标可注册、独创性或市场识别度，这些结论必须由人工或法律审查承担。当前插件没有外部 Skill 依赖。

```bash
node --test plugins/logo-project-delivery-guard/tests/*.test.mjs
```
