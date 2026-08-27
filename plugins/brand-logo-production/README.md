# Logo 项目交付守卫

`brand-logo-production` 管 Logo 工程，不管整套 VI。v0.7 串联 `brief/context → 六类概念 → 反馈选择 → master → 合适的构图法 → variants/delivery → preview → 独立 review → release`。只改文件名、交空图、交 schema 桩、伪造外部 Skill 使用记录或伪造 wrapper，过不了。

Fibonacci / φ 只是可选构图法：仅当 `construction.method=fibonacci` 时才要求并复算；网格、几何、字形与光学校正也是合法选择。任何构图法都不等于更好看，也不等于商标能注册。

## 目标

把 Logo 从品牌 brief、概念分歧、矢量 master、构图说明、多场景变体、预览、独立审查到 release 收成可重算的工程闭包。插件重点防止空壳 SVG、伪造构图关系、旧预览复用、自审和任意工具直接改写受保护证据。

## 实现

`logo-project-authoring` 组织生产，`logo-project-review` 在独立会话审查；四个第一方顾问只提供只读建议。登记 CLI 通过一次性 capability 完成 advice 准入、lockfile 生成、渲染、实测预览、阶段升级、审查和 release。Hook 限制 writer 路径与 shell 形状，receipt 用 SHA-256 绑定 source、master、construction、preview、review 与最终输出。

## 工程契约

`plan.contract.json` 必须绑定项目和 `source` 或 `release` 阶段。Brief、品牌上下文、参考/资产来源、概念选择轮次、交付 profile 与 Figma capability/fallback 都有独立 JSON 契约。必须先给出 symbolic、typographic、monogram、negative-space、geometric、narrative 六类黑白概念及至少两轮反馈，再精确选择一个。注册 renderer 生成带 source SHA-256 的真实 PNG。

## 第一方顾问编排

候选池是捆绑 Skill：`logo-brand-direction`、`logo-form-language`、`logo-color-accessibility`、`logo-presentation-system`。按品牌方向、矢量生产、色彩可访问性、呈现交付角色动态择优，不强制加载完整名单；最多使用 3 个且 advice artifact 必须互不相同。

方法来源与归因见 `licenses/`：brand-identity（MIT）、logo-design（MIT）、color-expert（CC-BY-4.0，`licenses/color-expert/NOTICE.md`）、logo-generator 的 pattern 摘录（MIT）。安装本插件即自带这些 Skill，不再读取 `skill-deps.json`。

顾问只有建议权：不能写项目、运行脚本或联网流程、生成受保护 evidence、担任独立 reviewer 或执行 release。每个 `used` worker 在项目外生成 Result Card，再由 `project-advice.mjs` 校验 name、phase、subject digest 后准入 `evidence/skills/`。`skipped` 与 `unavailable` 必须记录真实原因。

master 固定为 `Mark.logo.tsx`、`Wordmark.logo.tsx`、`Lockup.logo.tsx`，每个文件只导出同名原生 SVG component。built master 必须是带 `viewBox` 和可渲染 vector geometry 的自包含 SVG；无效 path data、无尺寸 primitive、固定 width/height、raster、text、远程资源或运行期 I/O 都会被拒绝。

### Source 阶段

- `standard-grid.json` 绑定当前 master digest，并声明正 unit、clear space 与 minimumPixels。
- `geometry.json` 为三个 master role 映射实际 SVG primitive id；mapping 和 primitive id 必须唯一，参数必须是有限数值。
- 仅在 `construction.method=fibonacci` 时，`fibonacci.json` 才使用 `[1,1,2,3,5,8,13]` 并证明 circles、spiral、anchor 与实际 master 的关系；其他方法不得为了过门而伪造黄金比例。
- mark SVG 必须实际实现声明圆的圆心或圆周关系。
- standard、geometry 以及所选方法需要的 construction sheet 绑定当前 master digest；PNG 会校验 signature、chunk CRC、IDAT 解压长度与 IEND。
- construction manifest 绑定全部制图页原始字节。

### Release 阶段

Release 在 Source 闭包之上还必须包含：

- primary/mono/reverse 的 mark、wordmark、lockup SVG、stacked lockup、透明 64/128/256/512 PNG、16/32 favicon 与 512 app icon；
- specimen、application mockup、CMYK/spot-color 生产说明，以及可导入 Figma 的 SVG fallback manifest；
- accessibility、approved review 与 release manifest；
- 绑定 master digest 的 preview strip 和 manifest，覆盖 16/32/64、black/mono 与 reverse；
- squint JSON 使用实测 `box-blur-threshold-connected-components`，绑定 strip digest、真实 bbox 和每格指标；
- brief fidelity、concept divergence、vector craft、mono/reverse、scene application、delivery profile 六项检查全部通过；六项审美标准逐项为 2 且有当前 artifact/digest 覆盖，不能用总分平均掩盖短板；
- receipt 同时绑定 source、master、construction、preview、review 和最终输出。

## 注册工具工作流

项目 `package.json` 必须提供 `logo:render`。这是项目自有、受信任的可执行配置边界；它可以读取项目源码并生成文件，但输出仍须通过格式、关系、manifest 和 digest 校验。

按顺序使用 `project-advice.mjs`、`project-lock.mjs`、`project-render.mjs`、`project-validate.mjs`、`project-preview.mjs`、`project-stage.mjs`、`project-review.mjs`、`project-release.mjs` 完成建议准入、锁文件生成、生成、实测预览、单调升级、独立评审和 receipt 签发。`project-lock.mjs` 以 `--package-lock-only --ignore-scripts` 调用 npm，只允许 `package-lock.json` 变化，并拒绝新增 `node_modules/` 或其他项目写入。

`project-preview.mjs` 在插件内构建多尺寸黑稿/反白稿条带，通过 FFmpeg 栅格化为真实 PNG，再做 squint 分析；它不查找外部 Skill，也不能写 `review.logo.json`。运行环境需提供支持 SVG 输入的 FFmpeg；非标准安装位置可通过 `LOGO_PREVIEW_RENDERER` 指定可执行文件。仓库规定的 host-acceptance 容器已包含该运行时。

`project-review.mjs` 只接收项目外 review-input JSON，要求 reviewer session 与 render/release session 分离，覆盖当前 master、construction、variants、PNG 和 preview hashes。blocker/major finding 必须由 reviewer 对当前 artifact 复验为 `verified`。插件不声称替代商标法务判断。

所有 mutating wrapper 消耗 30 秒、单次、argv/session/subject 绑定 capability 并使用独占 journal。renderer 只能写 render-owned 路径；若它碰 preview、advice、review、manifest 或 receipt，wrapper 会恢复原字节并失败。`project-release.mjs` 独占写 release manifest 与 receipt。已有 plan 不能通过普通编辑工具删除或降级，只能使用 `project-stage.mjs` 单调升级。

## Hook 与边界

Hook 采用 fail-closed shell policy：Logo scope 只允许窄化的只读命令，或参数形状精确匹配的 `project-advice`、`project-lint`、`project-lock`、`project-render`、`project-stage`、`project-preview`、`project-review`、`project-validate`、`project-release`。

注册工具只能指向 workspace 内已发现、非 symlink 的 Logo 项目实体目录。路径伪装的同名二进制、`rg --pre`、可写 `sed`/`find`、wrapper 路径仅作为普通参数、`node -e`、compound shell 和畸形 hook JSON 都不会放行。没有 Logo 项目的普通会话不受这组 shell allowlist 影响。

Hook、receipt 和几何检查都不等于商标能注册、一定原创或一定好认。那些要人审或法务看。

## 验证

```bash
npx tsx --test plugins/brand-logo-production/tests/*.test.ts
```

Claude/Codex live 验收只允许在 `docker/host-acceptance` 容器内运行，见根目录 `AGENTS.md` 与 `docs/host-acceptance.md`。
