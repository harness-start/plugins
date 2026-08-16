# Logo Project Delivery Guard

`brand-logo-production` 管 Logo 工程，不管整套 VI。v0.4 通过 `$logo-project-authoring` 串联 `brief → concept → master → construction → variants → preview → review → release`，并用 `$logo-project-review` 做独立终审。只改文件名、交空图、交 schema 桩、伪造外部 Skill 使用记录或伪造 wrapper，过不了。

Fibonacci / φ 检查的是：构造关系能按当前 master 复算。它不说黄金比例一定更好看，也不等于商标能注册。

## 工程契约

`plan.contract.json` 必须绑定项目和 `source` 或 `release` 阶段。`plan.brief.json` 固化受众、品牌定位、语言、约束、禁用方向和成功标准。`plan.skill-composition.json` 保存完整的中英文公开候选池、真实状态和选择理由。概念文件使用 `NNN-slug.logo.tsx`，concept id 与 source 必须唯一，`logo.project.json` 必须精确选择其中一个概念。注册 renderer 生成带 source SHA-256 的真实 PNG。

## 外部 Skill 编排

候选池包含英文 `brand-identity`、`logo-design`、`color-expert` 和中文生态的双语 `logo-generator`。每个项目动态择优，最多使用 3 个且 advice artifact 必须互不相同；不强制每次同时使用中英文 Skill。

来源与归因：[`brand-identity`](https://github.com/arnabbagxd/Brand-building-skills)（MIT）、[`logo-design`](https://github.com/seb1n/awesome-ai-agent-skills)（MIT，作者 Burhan Sebin / AI Agent Skills Community）、[`color-expert`](https://github.com/meodai/skill.color-expert)（CC-BY-4.0，作者/项目归因为 `meodai/skill.color-expert`）、[`logo-generator`](https://github.com/op7418/logo-generator-skill)（MIT，双语社区项目）。实际安装来源和 reference-only allowlist 以 `skill-deps.json` 为准。

外部 Skill 只有建议权：不能写项目、运行 reference-only 包的脚本或联网流程、生成受保护 evidence、担任独立 reviewer 或执行 release。每个 `used` worker 在项目外生成 Result Card，再由 `project-advice.mjs` 校验 name、phase、subject digest 后准入 `evidence/skills/`。`skipped` 与 `unavailable` 必须记录真实原因。

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
- `singleMemoryPoint`、`opticalCraft`、`markWordmarkSystem` 的 `requiredMin` 不得低于 2，分数均达到阈值并记录实质说明；
- receipt 同时绑定 source、master、construction、preview、review 和最终输出。

## 注册工具工作流

项目 `package.json` 必须提供 `logo:render`。这是项目自有、受信任的可执行配置边界；它可以读取项目源码并生成文件，但输出仍须通过格式、关系、manifest 和 digest 校验。

按顺序使用 `project-advice.mjs`、`project-render.mjs`、`project-validate.mjs`、`project-preview.mjs`、`project-stage.mjs`、`project-review.mjs`、`project-release.mjs` 完成建议准入、生成、实测预览、单调升级、独立评审和 receipt 签发。

`project-preview.mjs` 在插件内构建多尺寸黑稿/反白稿条带，通过 FFmpeg 栅格化为真实 PNG，再做 squint 分析；它不查找外部 Skill，也不能写 `review.logo.json`。运行环境需提供支持 SVG 输入的 FFmpeg；非标准安装位置可通过 `LOGO_PREVIEW_RENDERER` 指定可执行文件。仓库规定的 host-acceptance 容器已包含该运行时。

`project-review.mjs` 只接收项目外 review-input JSON，要求 reviewer session 与 render/release session 分离，覆盖当前 master、construction、variants、PNG 和 preview hashes。blocker/major finding 必须由 reviewer 对当前 artifact 复验为 `verified`。插件不声称替代商标法务判断。

所有 mutating wrapper 消耗 30 秒、单次、argv/session/subject 绑定 capability 并使用独占 journal。renderer 只能写 render-owned 路径；若它碰 preview、advice、review、manifest 或 receipt，wrapper 会恢复原字节并失败。`project-release.mjs` 独占写 release manifest 与 receipt。已有 plan 不能通过普通编辑工具删除或降级，只能使用 `project-stage.mjs` 单调升级。

## Hook 与边界

Hook 采用 fail-closed shell policy：Logo scope 只允许窄化的只读命令，或参数形状精确匹配的 `project-advice`、`project-lint`、`project-render`、`project-stage`、`project-preview`、`project-review`、`project-validate`、`project-release`。

注册工具只能指向 workspace 内已发现、非 symlink 的 Logo 项目实体目录。路径伪装的同名二进制、`rg --pre`、可写 `sed`/`find`、wrapper 路径仅作为普通参数、`node -e`、compound shell 和畸形 hook JSON 都不会放行。没有 Logo 项目的普通会话不受这组 shell allowlist 影响。

Hook、receipt 和几何检查都不等于商标能注册、一定原创或一定好认。那些要人审或法务看。

## 验证

```bash
npx tsx --test plugins/brand-logo-production/tests/*.test.ts
```

Claude/Codex live 验收只允许在 `docker/host-acceptance` 容器内运行，见根目录 `AGENTS.md` 与 `docs/host-acceptance.md`。
