# Artifact Delivery Evidence 插件与硬 Hook Harness

## 结论与目标

本方案把上游产物交付能力迁移为可独立安装的 Claude Code / Codex 插件。拆分边界按业务阶段、载体和运行平台确定，不按文件扩展名或 Skill 数量确定。

插件只能硬保证存在可信因果链的结果：

```text
受控输入
→ 可观测 mutation
→ 最终字节快照
→ 确定性验证或具名决策
→ 原子 release
→ Stop 有界复核
```

Prompt 命中、Skill 激活、格式合规、模型多看一遍或自由文本声明都不能单独证明产物符合预期。缺少任一环时，插件必须降为 evidence-only 或 advisory，不能宣传为 hard gate。

## 保证边界

每条 acceptance 必须先归入以下一类：

| 类型 | Hook 可以保证什么 | 是否允许 fail-closed |
| --- | --- | --- |
| `objective` | 对同一字节快照执行可复算测量，结果与明确阈值比较 | 测量失败、证据漂移或 required criterion 未满足时允许 |
| `evidence-required` | 指定样本、状态和 criterion 已被合格 reviewer 覆盖 | 缺证、旧证或 reviewer 不合格时允许；不能把模型平均分当客观真值 |
| `attestation` | 用户、法务或业务 owner 对指定 subject 作过具名确认 | 缺少绑定证据时允许；Hook 不证明声明内容真实 |
| `advisory` | 启发式或语义观察已记录，并给出定位 | 不允许，仅生成 warning 或 `unverified` |

硬 Hook 只阻断以下可观察违约：

- 受控范围已进入 hard 模式，却绕过必需阶段或受控 Tool；
- source、dependency、candidate、review spec 或 release bytes 已变化，仍引用旧 receipt；
- release/publish 的 manifest、subject digest、validator 或 verifier 不闭合；
- 完成态声称覆盖了未执行、未抽样或无法复算的检查。

品牌语义、审美、学习效果和素材权利真实性不属于机械事实。项目可以要求相应 review 或 attestation，但不能把“有一段说明”写成“业务结果已证明”。

## 组件结构

```text
artifact-evidence-runtime                    内部共享包，不单独安装
├── design-brief-gate                        跨载体：生产前合同
├── design-review-evidence-guard             跨载体：审查与复验合同
│
├── pptx-project-delivery-guard               PptxGenJS 工程、PPTX、同源 PDF
├── poster-project-delivery-guard             Satori/resvg 海报、封面、Banner
├── video-project-delivery-guard              Remotion 视频、动效、GIF
├── brand-identity-delivery-guard            Logo、字标、VI、色板、字体
└── document-publication-delivery-guard      报告、手册、出版 PDF

content-verification-evidence-guard          内容可信度核验
learning-experience-delivery-guard           培训方案与学习资产
```

`artifact-delivery-evidence-gates` 保留为套件名或安装集合，不注册总门禁。总门禁会把不同载体的缺证误合并，也无法给出准确恢复路径。

## 文件命名与激活

### 路径合同

默认受控根为 `artifacts/`，项目配置可以增加受控根，但不能放宽命名 grammar。先按 carrier 分目录，再按 artifact id 建独立工程：

```text
<artifact-root>/<carrier>/<artifact-id>/
```

当前 carrier 固定为 `pptx | poster | video | brand | document | content | learning`。工程根的公共合同文件继续使用：

```text
<stage>.<role>[.<index>].<ext>
```

约束如下：

- `carrier` 必须来自已安装插件注册表；`artifact-id` 与 `role` 使用小写 kebab-case，`artifact-id` 最长 64 字符；
- `stage` 固定为 `plan | source | candidate | evidence | review | release | receipt`；
- `index` 只用于有序集合，固定三位 `001..999`，不得重复或断号；
- `ext` 必须在 carrier role registry 的 allowlist 中；不信任扩展名，validator 仍检查实际文件类型；
- 每个 artifact 的首个受控文件必须是 `plan.contract.json`；最终必须有 `release.manifest.json` 与 `receipt.release.json`；
- `plan.contract.json` 内的 `artifactId` 必须等于目录名，`carrier` 必须等于父目录名；required roles、数量和 validator profile 以文件内容为准。
- `review.*` 只能由登记 reviewer 写入；`release.manifest.json` 与 `receipt.release.json` 只能由登记的 carrier release Tool 在同一发布事务中生成，carrier Tool 内部复用 `artifact-release`。

示例：

```text
artifacts/poster/spring-launch/
├── plan.contract.json
├── plan.assets.json
├── src/variants/001-main.tsx
├── src/variants/001-main.<source-sha256>.svg
├── src/variants/001-main.<source-sha256>.png
├── dist/spring-launch.png
├── review.independent.json
├── release.manifest.json
└── receipt.release.json
```

文件名只负责发现、分流和阶段识别，不证明文件内容有效。手工把旧文件改名为 `review.independent.json` 或 `receipt.release.json` 不会产生 operational receipt，也不能推进状态。

公共文件保持在工程根；`src/`、`assets/`、`dist/` 等嵌套目录必须由 carrier 的 `ProjectLayoutProfileV1` 明确声明。未登记的子目录、跨 carrier 路径或任意深度嵌套在 `ToolBefore` 阻断。

### 命名激活

- `SessionStart` 加载 `.artifact-delivery.mjs` 中的 artifact roots、carrier registry 与 project layout profile；
- `ToolBefore` 发现目标位于受控根时立即解析目录和文件名；合法的 `plan.contract.json` 首次写入只创建按目录名键控的 `DISCOVERED` 临时态；
- `ToolAfter` 校验 plan 内容、目录 identity 和 carrier profile，成功后才进入 `PLANNED`；失败时保留诊断并禁止其他 stage；
- 受控目录中的未知名称、越级 stage、未知 role、错误扩展名或非法 index 在写入前阻断；
- Prompt、Skill 或 carrier 关键词只注入命名提示，不能直接开启 fail-closed；
- 受控根外的既有 source 可以作为只读 dependency，由 `plan.contract.json` 显式引用并冻结 hash。

项目未配置受控根时使用默认 `artifacts/`。因此 hard 激活由 `<carrier>/<artifact-id>` 下的明确文件目标触发，不依赖模型是否记得调用 open Tool。

## 执行模式

### Enforcement mode

| 模式 | 写入约束 | 可以声称的硬效果 |
| --- | --- | --- |
| `closed` | 受控根只允许登记过的 mutation Tool；未知目标的 Bash/custom Tool 在执行前阻断 | 命名、阶段顺序、mutation 失效、release 闭合 |
| `snapshot` | 允许一般 Tool；每个 mutation-capable Tool 后重算受控 scope digest | 能发现执行后的变化并阻断 release/Stop，不能声称阻止首次写入 |
| `observe-only` | 宿主无法稳定提供事件、目标或快照 | 只能提示和报告，不得注册 fail-closed 业务 Hook |

`closed` 模式使用显式 Tool catalog；能执行任意代码或声明可能写入、但无法证明目标范围的 Tool 一律视为 mutation-capable。插件必须在状态和完成报告中写明 enforcement mode。项目把 artifact root 声明为 required-hard 时，配置损坏必须阻断该根的 mutation/release；普通会话缺少 hard 前提时降为 `observe-only`，不能悄悄保留 hard 标识。

## 共享内核：`artifact-evidence-runtime`

以下 Tool 和 schema 是拟实现合同，不代表当前 Marketplace 已提供。

### 核心 Tool

| Tool | 职责 | 关键输出 |
| --- | --- | --- |
| `artifact-snapshot` | 对声明的 source、dependency、candidate 或 release 集合生成规范快照 | 文件 proofs、集合 `subjectDigest` |
| `artifact-stage-validate` | 调用载体 validator 并绑定输入快照 | validator receipt、criterion results |
| `artifact-release` | 校验所有前置 receipt，从已验证文件描述符读取并以 no-clobber/atomic 方式发布本地产物 | release manifest、release receipt、last-good |
| `artifact-final-verify` | 有界复核当前 release，并关闭受控状态 | final verification receipt、remaining `unverified` |

外部上传、发送或发布不能复用本地 `artifact-release`。相应 Tool 必须声明 `requires-verifier`，用相同 subject digest 的远端读取结果关闭外部 effect。

### 公共 schema

- `ArtifactSessionStateV1`：`carrier + artifactId`、project root、mode、phase、generation 和最后一次 digest 变化；
- `ArtifactPlanV1`：brief、asset manifest、输出角色、required states 和分类后的 acceptance；
- `ArtifactSnapshotV1`：快照角色、规范相对路径、size、SHA-256、集合 subject digest 和 Tool provenance；
- `ArtifactFileCheckV1`：单文件的 path tuple、SHA-256、实际类型与各 validator 结果；
- `ArtifactStageReceiptV1`：同一 generation 下 required roles、file checks 和 stage subject digest 的聚合结果；
- `ArtifactReviewBundleV1`：review spec/result、producer/reviewer identity、隔离证据、finding 和 recheck；
- `ArtifactReleaseManifestV1`：最终 source/output snapshot、validator receipts、review、attestation、`unverified` 和 release 状态。

`CarrierRoleRegistryV1` 为每个 carrier 声明 `stage + role`、基数、允许扩展名、前置角色和 validator IDs。它是命名路由和检测 DAG 的唯一配置源；插件不能在多个 Hook 中复制文件名判断。

`ProjectLayoutProfileV1` 声明 carrier 工程允许的目录、源文件命名、单元边界、构建入口和稳定输出路径。role registry 管公共 artifact 文件，layout profile 管 `src/assets/dist` 等工程内部结构。

文件 proof 必须绑定实际读取的同一组 bytes，包含规范相对路径、角色、size 和 SHA-256。release 不能先按路径校验、再重新按路径读取；校验、复制和 manifest 必须复用同一打开文件的身份与内容，避免检查后替换。receipt 至少包含 `toolId`、`invocationId`、Tool/validator 版本、subject digest、session、时间、exit code 和 timeout 状态。

`workspaceRevision` 只能作为快速提示，不能作为 freshness 真值。有效性以 artifact 自身的 scope/plan/candidate/review/release digest 为准；无关文件变化不能使其他 artifact 的证据失效。

### 状态机

```text
DISCOVERED
→ PLANNED
→ SOURCED
→ CANDIDATE
→ EVIDENCED
→ REVIEWED
→ RELEASED
→ VERIFIED
```

默认串联关系为：

```text
plan → source → candidate → evidence → review → release → receipt
```

carrier 可以在 `plan.contract.json` 中选择 registry 明确允许的可选 stage，但不能跳过 registry 标记为 required 的阶段。

| 变化 | 必须失效的状态 |
| --- | --- |
| artifact root、registry 或 project config digest 变化 | 全部状态，重新解析所有受控文件 |
| `plan.*` 或 dependency digest 变化 | source 及之后 |
| `source.*` digest 变化 | candidate 及之后 |
| `candidate.*` 或 validator spec 变化 | evidence 及之后 |
| `evidence.*` digest 变化 | review 及之后 |
| `review.*` 或 reviewer qualification 变化 | release 及之后 |
| `release.manifest.json`、最终 bytes 或 release Tool 版本变化 | receipt 与 final verification |

每次转换使用 `artifactId + generation` 做 compare-and-swap。状态存储使用宿主插件数据目录、原子 rename、跨进程锁、TTL 和有界记录数；不得写插件安装目录。

### Hook 链

| Event | 硬行为 | 限制 |
| --- | --- | --- |
| `SessionStart` | 加载可信项目配置、artifact roots、carrier/role registry 和 layout profile | 不扫描无界目录，不创建猜测性的 artifact |
| `PromptSubmitted` | 注入目录/文件名提示，记录显式 carrier 请求 | 不直接开启 fail-closed |
| `ToolBefore` | 解析 carrier/project/path，检查首文件、目录 profile、stage 前置、role/ext/index 和专用 Tool 所有权 | 无法解析目标的 mutation Tool 必须整体阻断或降级，不能假定无写入 |
| `ToolAfter` | 按文件名分派 validator，记录 receipt，重算 artifact digest 并执行失效转换 | 非零退出、timeout 或 effect may have occurred 也必须重算 |
| `AgentStopped` | 复核 required filenames、manifest、最终 bytes 和当前 receipt/tag | 不运行 Office、编码器或模型审查，只执行有界内容检查 |

Tool tag 只用于把回复关联到 operational fact。tag 本身不是证据；必须匹配当前 session、当前 generation、正确 subject digest、成功且未超时的真实 receipt。

如果宿主不能在 Tool 失败或超时后稳定发出可消费事件，该平台不得为相应 scope 声明 `snapshot`/`closed` hard freshness。依赖“成功返回才记 mutation”的实现不合格。

### 检测编排

一次文件 mutation 先并行执行互不依赖的检查，再串联推进 stage：

```text
path grammar ─┐
file type ────┤
schema ───────┼→ FileCheckResultV1
size/hash ────┤          ↓
carrier lint ─┘   StageReceiptV1
                         ↓
              下一 stage 解锁
```

| Stage | 并行检查 | 串联门槛 |
| --- | --- | --- |
| `plan` | identity、schema、required roles、asset references、acceptance 分类 | `plan.contract.json` 有效后才允许其他 stage |
| `source` | file type、可编辑性、dependency hash、source schema | plan receipt fresh，全部 required source role 齐全 |
| `candidate` | magic bytes、尺寸/页数/时长、render binding、集合 index | source receipt fresh，candidate 绑定当前 source digest |
| `evidence` | measurement schema、subject、locator、validator version | candidate receipt fresh，证据来自当前 candidate bytes |
| `review` | coverage、reviewer identity、finding/recheck、candidate/evidence hash | required evidence 齐全且 reviewer 合格 |
| `release` | required roles、manifest closure、hash、no-clobber publish | 所有 required stage receipt fresh |
| `receipt` | operational provenance、session、generation、subject、exit/timeout | 只能由登记 Tool 生成，手写文件无效 |

轻量检查可以由 `ToolAfter` Hook 有界执行；渲染、编码、Office、模型审查等重任务必须由专用 Tool 产生 artifact-bound receipt，Hook 只调度和核对。并行检查全部成功后才生成 stage receipt，任一 required check 失败都不推进状态。

### Role registry 基线

| 插件 | Plan / Source | Candidate | Evidence / Review | Closure |
| --- | --- | --- | --- | --- |
| pptx | `plan.contract.json`、`pptx.project.json`、`src/slides/manifest.json`、每页 source 与同目录 hash preview | `dist/<artifact-id>.pptx`、`dist/<artifact-id>.pdf` | `dist/pages/001.png`、`evidence.structure.json`、`review.visual.json` | `release.manifest.json`、`receipt.release.json` |
| poster | `plan.contract.json`、`plan.assets.json`、`poster.project.json`、variant TSX/data 与同目录 SVG/PNG proof | `dist/<artifact-id>.png` | 最终输出测量、`review.independent.json` | `release.manifest.json`、`receipt.release.json` |
| brand | `plan.contract.json`、`plan.assets.json`、`source.master.svg` | `candidate.variant.001.svg` | `evidence.preview-strip.png`、`evidence.color.json`、`evidence.font.json`、`review.independent.json` | 同上 |
| video | `plan.contract.json`、`plan.storyboard.json`、`video.project.json`、scene source 与同目录 hash preview clip | `dist/<artifact-id>.mp4` | `evidence.probe.json`、最终成片抽帧、`review.continuity.json` | 同上 |
| document | `plan.contract.json`、`source.master.md` | `candidate.screen.pdf`；可选 `candidate.print.pdf` | `evidence.page.001.png`、`evidence.structure.json`、`review.visual.json` | 同上 |
| content | `plan.contract.json`、`source.snapshot.001.json`、`source.claims.json` | `candidate.report.md` | `evidence.run.json` | 同上 |
| learning | `plan.contract.json`、`source.curriculum.md`、`source.exercise.001.md` | 由 plan 定义交付角色 | `evidence.readback.json`、`evidence.assessment.json` | 同上 |

嵌套 source 同目录的 hash preview 属于 source-stage proof，不是 candidate evidence。全部单元 source/preview 闭合后才进入 `SOURCED`；`dist/` 候选生成后产生的逐页、逐帧或最终测量才进入 `EVIDENCED`。

### 完成状态

- `DONE`：所有 required stage、objective acceptance、release 和 final verification 闭合；
- `DONE_WITH_CONCERNS`：仅用于工作本身已经完成且只剩非阻断 warning/unverified 的 review-only 任务，不能替代缺失的 workflow evidence；
- `NEEDS_CONTEXT`：缺少用户选择、输入文件、许可决定或 acceptance 定义；
- `BLOCKED`：确定性校验失败、运行环境缺失、权限不足或外部 effect 无法验证。

## 跨载体插件

### `design-brief-gate`

工作流：`plan.contract.json` / `plan.assets.json` → 并行 schema、identity、asset、acceptance 检查 → plan stage receipt → `PLANNED`。

硬 Hook：

- `ToolBefore` 只允许 `plan.contract.json` 作为 artifact 目录首文件，并阻断 plan receipt 之前的其他 stage 写入；
- `snapshot` 模式只能在写入后标记越序，并阻断后续 release；
- `ToolAfter` 根据 `plan.contract`、`plan.assets`、`plan.storyboard` 等 role 并行分派 validator；未知信息必须保留为 unresolved；
- 高风险方向选择绑定真实 transcript 的 session、turn/message digest、候选 digest 和 selected id，非空自由文本不算确认。

不保证：brief 的商业判断正确、素材许可真实或用户一定喜欢所选方向。

### `design-review-evidence-guard`

工作流：`candidate.*` snapshot → `evidence.*` → `review.spec.json` / `review.result.json` → recheck → review stage receipt → `REVIEWED`。

硬 Hook：

- required objective criterion 必须有测量值、阈值、subject 和 locator，任一失败单独阻断；
- required heuristic/semantic 项只能因缺少合格 review 或具名 reject decision 阻断，不能按模型平均分阻断；
- candidate、measurement 或 spec digest 改变后旧 review 失效；
- blocker/major 的最终复验必须绑定与 producer 不同的 reviewer invocation，并有隔离上下文或独立 agent lifecycle 证据；
- reviewer 参与过目标 artifact mutation 时，不得签发独立复验 receipt；
- `review.*.json` 只能由登记 reviewer Tool 或隔离 agent handoff 写入，普通 producer mutation 在 `ToolBefore` 阻断。

不保证：图像模型判断是审美真值；语义验收需要项目指定的 reviewer 或用户 attestation。

## 载体插件

所有载体插件先实现同一组 Hook seam：

- `ToolBefore`：校验公共 `stage.role[.index].ext` 或 carrier project profile、当前 phase 和 writer ownership；release 前同步重算前置 subject；
- `ToolAfter`：按 role registry 并行运行轻量 validator；无论成功、失败或部分副作用都重算 artifact digest；
- `AgentStopped`：按 carrier completion claim 复核 manifest、最终 bytes、required receipt 和 `unverified`，不现场运行重型生产工具。

以下各节只定义 carrier 特有的 validator 和证据，不重复共享 runtime 行为。

### `pptx-project-delivery-guard`

PPT 使用 [PptxGenJS](https://github.com/gitbrent/PptxGenJS)；不支持在同一 hard profile 中切换到其他生成引擎。PptxGenJS 负责生成原生可编辑 OOXML，PDF、逐页 PNG 和结构报告必须由同一候选 PPTX 派生。

#### 工程路径

工程根固定为 `artifacts/pptx/<deck-id>/`，完整路径必须匹配 `^artifacts/pptx/[a-z0-9]+(?:-[a-z0-9]+)*/$`。目录结构：

```text
artifacts/pptx/quarterly-review/
├── plan.contract.json
├── pptx.project.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── deck.ts
│   ├── theme.ts
│   └── slides/
│       ├── manifest.json
│       ├── 001-cover.ts
│       ├── 001-cover.<source-sha256>.png
│       ├── 002-summary.ts
│       └── 002-summary.<source-sha256>.png
├── assets/
├── dist/
│   ├── quarterly-review.pptx
│   ├── quarterly-review.pdf
│   └── pages/
│       ├── 001.png
│       └── 002.png
├── evidence.structure.json
├── review.visual.json
├── release.manifest.json
└── receipt.release.json
```

JavaScript 项目把 `.ts` 换成 `.js` 并省略 `tsconfig.json`。`pptx.project.json` 必须声明 `deckId`、`language`、layout、entry、slides manifest 和上述输出路径；一个工程不能混用 JS/TS。`package.json` 中 `pptxgenjs` 使用精确版本，`package-lock.json` 必须与之闭合。

`src/slides/manifest.json` 每条记录至少包含 `index`、`id`、`sourcePath`、`sourceSha256`、`previewPath`、`previewSha256`、`renderSubjectDigest`、page role 和可见标题。数组顺序、三位 index、source 文件名前缀和最终 PPTX 页序必须完全一致。

#### 单页模块合同

- slide source 固定为 `src/slides/<NNN>-<slug>.js|ts`，相对文件名匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:js|ts)$`，从 `001` 连续编号；
- `src/slides/manifest.json` 是唯一顺序源，每条记录只能引用一个 source，source 也只能出现一次；
- 只有 `src/deck.js|ts` 可以 import/实例化 PptxGenJS、调用 `addSlide()` 和 `writeFile()`；
- deck assembler 按 manifest 顺序为每条记录调用一次 `addSlide()`，再把这一个 Slide 传给对应 module；
- slide module 只导出拟定的 `buildSlide(ctx)`，`ctx` 含当前 Slide、theme、assets 和页面数据，不暴露 Presentation；
- slide module 禁止 import `pptxgenjs` 运行时值，禁止 `new PptxGenJS`、`addSlide()`、`writeFile()`、修改其他 slide 或写文件；
- slide module 禁止 import `src/deck`、其他 slide 或未登记 helper；TypeScript 的 PptxGenJS `import type` 可以由 lint allowlist 放行；
- shared helper 同样不能持有 Presentation 或调用 `addSlide()`，否则单页 capability boundary 可被间接绕过；
- AST lint 与受控 build 同时校验 module 边界；仅统计源码里的 `addSlide` 文本不足以证明一页一文件。

这样，“一个 slide 文件只处理一页”由 capability boundary 保证，而不是靠注释或命名约定。

#### 同目录哈希预览

每个 source 必须有且只有一个当前预览：

```text
001-cover.ts
001-cover.<source-file-sha256>.png
```

hash 使用 source 文件原始 bytes 的完整 64 位小写 SHA-256。source 改变后，旧文件名立即失效；旧 hash preview 不能留在 `src/slides/` 冒充当前证据。

preview 相对文件名必须匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.[a-f0-9]{64}\.png$`，且去掉 hash 与扩展名后的 basename 必须与 source 完全一致。

文件名只绑定当前 source。`manifest.json` 和 preview receipt 还要记录 `renderSubjectDigest`，覆盖 `pptx.project.json`、lockfile、deck/theme/layout helper、source、引用资产及渲染器版本。共享依赖变化时，即使 source hash 未变，preview 仍失效。

`pptx-slide-preview` 是 preview 的唯一 writer。它使用正式 assembler 和相同 layout/master 渲染指定页，写入 PNG 后返回 source hash、render subject、PNG hash、尺寸和 invocation ID。手工截图或手工改名无效。

拟实现的专用 Tool seam：

| Tool | 输出 |
| --- | --- |
| `pptx-project-lint` | project/profile、import graph、单页 module 和 manifest 诊断 |
| `pptx-slide-preview` | 单页 source-bound PNG 与 preview receipt |
| `pptx-project-build` | PPTX、同源 PDF、`dist/pages`、结构报告和 build receipt |
| `pptx-project-release` | release manifest、release receipt 与稳定 `dist` 闭包 |

#### 硬 Hook 链

- `ToolBefore`：阻断错误工程根、混合语言、slide 断号、未知嵌套、非 preview Tool 写 hash PNG，以及 slide module 写 release/dist；
- `ToolAfter(source)`：计算 source hash，运行 AST/module lint，使旧 preview、build、review、release 失效；theme、layout、lockfile 或资产变化按依赖图批量失效受影响页面；
- `ToolAfter(preview)`：并行验证命名 hash、PNG、尺寸、manifest record、render subject 和 Tool receipt；全部页面闭合后生成 source-stage receipt；
- `ToolBefore(build)`：所有 manifest slide 必须有 fresh preview；中央 assembler 必须是唯一 PptxGenJS owner；
- `ToolAfter(build)`：instrumentation 核对 assembler 每条记录只增加一页、module 执行前后 slide count 不再增长；再验证 manifest 数量、实际 PPTX 页数、`dist/pages` 数量、同源 PDF 和每页 source/preview/page proof；
- `ToolBefore(release)`：全部页面、结构、视觉 review 和高风险方向选择证据闭合；
- `AgentStopped`：有界复核工程路径、lockfile、slide/preview 一一对应、最终输出和 release receipt。

稳定输出只能是 `dist/<deck-id>.pptx`、`dist/<deck-id>.pdf` 和 `dist/pages/<NNN>.png`。候选或临时文件放宿主 cache，不允许在工程内创造第二套 `exports/`、`build/` 或任意命名输出。

现有 PptxGenJS starter、storyboard/build/release validator 可以迁移，但当前多页集中生成脚本必须拆为 assembler + 单页 module。插件不保证叙事说服力或审美结果，只保证工程边界、真实渲染和审查证据闭合。

### `poster-project-delivery-guard`

[Satori](https://github.com/vercel/satori) 把纯、无状态 JSX 转为 SVG；[resvg-js](https://github.com/thx/resvg-js) 再把该 SVG 光栅化为 PNG。参考的 [Bunny Launcher 示例](https://bunny-launcher.net/imaging/satori/#example) 采用相同两阶段链路，但本地 hard profile 固定使用 `satori` 与 `@resvg/resvg-js`，不混用 edge wrapper。

#### 工程路径

工程根匹配 `^artifacts/poster/[a-z0-9]+(?:-[a-z0-9]+)*/$`：

```text
artifacts/poster/spring-launch/
├── plan.contract.json
├── plan.assets.json
├── poster.project.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── render.ts
│   ├── theme.ts
│   └── variants/
│       ├── manifest.json
│       ├── 001-main.tsx
│       ├── 001-main.<source-sha256>.svg
│       └── 001-main.<source-sha256>.png
├── data/
│   └── 001-main.json
├── assets/
│   ├── fonts/
│   └── images/
├── dist/
│   └── spring-launch.png
├── evidence.render.json
├── review.independent.json
├── release.manifest.json
└── receipt.release.json
```

`poster.project.json` 固定 `posterId`、width、height、pixelRatio、background、entry、variant manifest、asset/data roots、颜色 profile 和稳定输出路径。一个 hard 工程只使用 TypeScript/TSX；`satori`、`@resvg/resvg-js`、React 与类型依赖都用精确版本并由 `package-lock.json` 闭合。

`src/variants/manifest.json` 是 variant 的唯一顺序源。每条记录包含 `index`、`id`、`sourcePath`、`sourceSha256`、`dataPath`、`dataSha256`、SVG/PNG proof path 与 hash、`renderSubjectDigest`、width 和 height。单主稿写 `dist/<poster-id>.png`；多规格写 `dist/variants/<NNN>-<slug>.png`，不得临时创造其他输出目录。

#### 单画布模块合同

- variant source 固定为 `src/variants/<NNN>-<slug>.tsx`，文件名匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.tsx$`；
- 每个 variant 只导出一个纯 `buildPoster(ctx)`，返回一个 JSX root；文案和素材取值来自只读 data/assets，不为单次出图修改布局源码；
- 只有 `src/render.ts` 可以 import Satori、resvg-js 和文件写入 API；它对每条 manifest 记录只调用一次 Satori 和一次 resvg；
- variant/helper 禁止 import 渲染器、`node:fs`、网络客户端或其他 variant，禁止 React state/effect、`dangerouslySetInnerHTML`、`<style>`、`<link>`、`<script>` 和普通 CSS animation；
- image/font 必须来自登记的本地文件或受控 data URI。字体显式传给 Satori；图片显式给出尺寸。远程 URL、系统字体 fallback 和运行期下载在 build 前阻断；
- lint 只允许 Satori 实际支持的元素与 CSS 子集；不能用浏览器 CSS 支持情况推断 Satori 一定能渲染；
- AST/import-graph lint 加受控 runtime instrumentation，核对每条记录只有一个 JSX root、一个 SVG 和一个 PNG，且 SVG viewBox、resvg 输出尺寸与 project profile 一致。

#### 同目录双阶段 proof

每个 source 必须同时有且只有一组当前 proof：

```text
001-main.tsx
001-main.<source-file-sha256>.svg
001-main.<source-file-sha256>.png
```

proof 文件名匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.[a-f0-9]{64}\.(?:svg|png)$`，SVG 与 PNG 必须使用同一 source hash。

文件名中的 SHA-256 只绑定 source bytes。`renderSubjectDigest` 还覆盖 project、lockfile、render/theme/helper、data、引用资产、字体及 Satori/resvg 版本；任一依赖变化都使 SVG、PNG、review 和 release 失效。`poster-variant-preview` 是两个 proof 的唯一 writer，必须先获得 Satori SVG，再把同一 SVG bytes 交给 resvg，receipt 同时记录两段 hash 和尺寸。

拟实现 Tool：

| Tool | 输出 |
| --- | --- |
| `poster-project-lint` | project/schema、Satori CSS、import graph、素材/字体和单画布诊断 |
| `poster-variant-preview` | source-bound SVG、PNG 与两阶段 receipt |
| `poster-project-build` | 当前 manifest 的稳定 PNG 候选和 render evidence |
| `poster-project-release` | release manifest、release receipt 与 `dist` 闭包 |

硬 Hook：`ToolBefore` 阻断错误目录、断号、非 preview Tool 写 hash proof、variant 访问渲染器/网络/文件系统；`ToolAfter(source/data/asset)` 重算依赖图并失效受影响 proof；`ToolAfter(preview)` 校验 source hash、SVG/PNG 因果链、尺寸、字体和 receipt；build 前要求全部 variant fresh，build 后检查最终 PNG magic bytes、尺寸、alpha、颜色 profile 和 render subject；release 前要求独立 review 与权利 attestation 闭合。`AgentStopped` 只核对文件和 receipt，不现场渲染。

现有 poster plan/assets、lint、review 和 package 合同可以迁移；Fabric `.poster.json` 与 Chromium renderer 不进入新 hard profile。若保留旧模板，只能通过显式 migration Tool 转成 TSX/data 后重新 lint、预览和 review，不能让两种 renderer 共用 receipt。

### `video-project-delivery-guard`

视频固定使用 [Remotion](https://www.remotion.dev/docs/) 做确定性 React 时间线。一个 hard 工程只交付一个 Composition、一个画幅/FPS/profile 和一个最终 MP4；横竖版或不同时长作为不同 `video-id`，避免同一工程出现多个“正式成片”。

#### 工程路径

工程根匹配 `^artifacts/video/[a-z0-9]+(?:-[a-z0-9]+)*/$`：

```text
artifacts/video/product-launch/
├── plan.contract.json
├── plan.storyboard.json
├── plan.assets.json
├── video.project.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── remotion.config.ts
├── src/
│   ├── index.ts
│   ├── Root.tsx
│   ├── Video.tsx
│   ├── theme.ts
│   └── scenes/
│       ├── manifest.json
│       ├── 001-intro.tsx
│       ├── 001-intro.<source-sha256>.mp4
│       ├── 002-demo.tsx
│       └── 002-demo.<source-sha256>.mp4
├── public/
│   ├── fonts/
│   ├── images/
│   ├── audio/
│   └── video/
├── dist/
│   └── product-launch.mp4
├── evidence.probe.json
├── evidence.frames.json
├── review.continuity.json
├── release.manifest.json
└── receipt.release.json
```

`video.project.json` 固定 `videoId`、`compositionId`、entry、storyboard、scene manifest、width、height、fps、durationInFrames、codec、audio profile、props schema 和 `dist/<video-id>.mp4`。`remotion` 与全部 `@remotion/*` 包必须是同一精确版本，lockfile 漂移使全部 preview/build evidence 失效。

`plan.storyboard.json` 是 scene 帧区间、转场重叠、字幕、音轨和连续性的唯一事实源，区间统一为 `[startFrame,endFrame)`。`src/scenes/manifest.json` 只映射 `index/id/storyboardSceneId/sourcePath/sourceSha256/previewPath/previewSha256/renderSubjectDigest`，不得复制一套可漂移的时间线。

#### 单 scene capability boundary

- scene source 固定为 `src/scenes/<NNN>-<slug>.tsx`，文件名匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.tsx$`，顺序与 storyboard scene 完全一致；
- `src/index.ts` 只能注册 Root；`src/Root.tsx` 是唯一 `<Composition>` owner；`src/Video.tsx` 是唯一顶层 `Sequence`/`Series`/`TransitionSeries` assembler；
- 每个 scene 只导出一个 component，接收局部 `durationInFrames`、只读 props 和 asset handles，不接收全局 start/end，也不能注册 Composition、调度其他 scene 或写文件；
- scene/helper 禁止 import `@remotion/renderer`、其他 scene、Root/Video、文件系统或网络客户端；render bundle 不得读取凭据或在渲染期访问远程素材；
- 时间只能来自 `useCurrentFrame()` 与 `useVideoConfig()`。禁止 timer、墙钟、`Date.now()`、无 seed 随机数和普通 CSS animation；需要随机时使用显式稳定 seed；
- props 必须可 JSON 序列化；字体、图片、音视频必须预先落入 `public/` 并登记 hash/许可，缺失资源调用 render cancellation，不能静默 fallback；
- AST/import-graph lint 加受控 Composition probe，核对一个交付 Composition、scene 一次引用、frame 区间闭合、总帧数一致，且 scene 无法改变顶层 timeline。

#### scene 预览与最终成片证据

每个 scene source 必须有一个同目录隔离预览片段：

```text
001-intro.tsx
001-intro.<source-file-sha256>.mp4
```

`video-scene-preview` 是 preview clip 的唯一 writer。它在宿主 cache 中生成受控临时 Composition，用该 scene 的正式 storyboard slice、props、字体和素材渲染完整局部区间；receipt 记录 source hash、`renderSubjectDigest`、帧数、fps、codec、MP4 hash，以及开头/中间/末尾解码帧 hash。`renderSubjectDigest` 覆盖 project、storyboard slice、lockfile、Root/Video/theme/shared components、props、引用资产、字体和 Remotion/Chromium/ffmpeg 版本。

preview 文件名匹配 `^[0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.[a-f0-9]{64}\.mp4$`。旧 hash clip 不得保留在 `src/scenes/`，避免 Hook 选择到多个事实源。

scene preview 只能关闭 source-stage proof，不能证明最终转场、音画同步或成片编码正确。最终 `dist/<video-id>.mp4` 必须直接 probe 和解码抽帧：开场、每个 scene 中间态、结束卡、每个转场前/中/后帧，以及字幕和有声路径。Composition still 或 scene preview 不能替代这些证据。

拟实现 Tool：

| Tool | 输出 |
| --- | --- |
| `video-project-lint` | storyboard、project、依赖版本、import graph、scene/timeline 诊断 |
| `video-scene-preview` | source-bound scene MP4 与局部 probe receipt |
| `video-project-render` | 最终 MP4、render log、hash 和 render receipt |
| `video-final-probe` | 最终文件 codec/FPS/尺寸/时长/帧数/音轨证据 |
| `video-final-sample` | 最终成片 required frame/timecode/hash 集合 |
| `video-project-release` | release manifest、release receipt 与 `dist` 闭包 |

硬 Hook：`ToolBefore` 阻断错误工程根、scene 断号、多 Composition、非 preview Tool 写 hash clip 和非 render/release Tool 写 `dist`；`ToolAfter(source/storyboard/asset)` 使依赖页面及最终成片失效；`ToolAfter(preview)` 直接 probe/decode 当前 clip；render 前要求 storyboard validator、全部 fresh preview、精确依赖版本、无远程资源和可用媒体 runtime；render 后要求最终 MP4 hash、probe、抽帧、音频/字幕检查与 review 全部绑定同一 generation；release 前还要有绑定当前 Remotion licensing 页面快照、适用场景和具名 owner 的许可决策。`AgentStopped` 不运行 Remotion 或 ffmpeg，只复核现有 receipt。

迁移 storyboard validate、media probe 和 frame sample；原 render/add-audio Tool 需改成 Remotion render adapter。Receipt 必须绑定最终媒体 digest、project generation 和工具版本，不能继续使用“同 session 即有效”。

### `brand-identity-delivery-guard`

工作流：brand brief → master vector → variant matrix → size/background proof → color/font proof → VI package → review → release。

硬 Hook：检查 master vector、组合/单色/反白/小尺寸角色齐全；校验 SVG viewBox、结构、实际像素占用、色值/profile、导出尺寸和 package manifest；缺少来源记录或权利 attestation 时阻断 release。

不保证：商标可注册、第三方权利声明真实、品牌语义匹配或市场效果。

当前只能迁移 logo preview 等局部工具。SVG 占用、variant matrix、color/font proof 和 VI package validator 补齐前不得发布 hard 版本。

### `document-publication-delivery-guard`

工作流：source snapshot → deterministic build → PDF snapshot/probe → full-page render → text/font/link/a11y audit → review → release。

硬 Hook：source、PDF、页数、字体、链接、目录和逐页 render hash 不闭合时阻断；裁切、缺字、空白页、损坏文本层和 required 字体未嵌入时阻断；印刷与屏幕版本分别声明输出角色和颜色 profile。

不保证：内容事实正确、法律合规或版式审美。内容可信度按需组合 content 插件。

当前 `md-to-pdf` 只能作为构建起点；PDF probe、全量 page render、font/link/a11y audit 和 release adapter 补齐前不得发布 hard 版本。

## 非设计插件

### `content-verification-evidence-guard`

工作流：source snapshot → claim extraction → verification run → deterministic report → run/report binding → completion。

硬 Hook：每条 claim 绑定冻结 source snapshot 和引用 locator；run/report digest、来源快照、validator receipt 或覆盖映射缺失时阻断核验完成态；来源内容变化后旧结论失效。

不保证：来源本身诚实、不可访问来源的真实性，或未来事实不会变化。时效性要求必须进入 plan 和 report。

迁移现有 content credibility render/validate 和 completion gate，并补 artifact generation 与 source snapshot 绑定。

### `learning-experience-delivery-guard`

工作流：TrainingBrief → curriculum/exercise assets → learner readback → validation → delivery；课件作为独立 pptx artifact 组合验收。

硬 Hook：检查受众、可观察目标、时长预算、练习、反馈、评估和 required 资产角色；readback 必须绑定同一 curriculum snapshot；课件工程和文件质量交给 pptx 插件。

不保证：学员真正掌握、迁移到工作或产生业务绩效。只有真实测评数据和明确阈值才能形成 objective acceptance。

当前只有 TrainingBrief 等局部校验起点。练习资产、readback、assessment mapping 和 delivery manifest validator 补齐前不得发布 hard 版本。

## 当前迁移判断

下表表示进入实现时的起点，不表示插件已经完成：

| 插件 | 可迁移起点 | 进入 hard 模式前的主要缺口 |
| --- | --- | --- |
| runtime | tagged completion、receipt、operational facts、path/hash/state store | path grammar、role registry、generation、检测 DAG、封闭写入和 release 状态机 |
| brief | accessibility plan、visual brief、storyboard 输入合同 | `plan.*` schema、首文件 gate、真实用户选择绑定 |
| review | design lint、perceptual、visual evidence | `review.*` writer ownership、reviewer lifecycle、generation binding |
| pptx | PptxGenJS starter、storyboard、build、release、完成门禁 | 固定工程 profile、单页 module、source-hash preview、用户选择防伪、artifact freshness |
| poster | plan/assets、设计 lint/review、package receipt | Satori/resvg adapter、TSX/CSS lint、双阶段 proof、单画布 instrumentation、统一 release |
| brand | logo preview、部分 color/font reference | 大部分确定性 validator 与完整 package 工具链 |
| video | storyboard、probe、sample、media runtime | Remotion adapter、scene capability boundary、隔离 preview、最终成片 freshness、统一 release |
| document | `md-to-pdf` 构建 | probe、逐页、字体、链接、a11y、release |
| content | run/report render 与 validate | source snapshot、generation 和时效性合同 |
| learning | TrainingBrief validator | exercise/readback/assessment/delivery 验证链 |

### 既有文件名迁移

迁移时按语义角色改名，不在 Hook 中长期兼容多套别名：

| 既有名称示例 | 目标名称 |
| --- | --- |
| `poster-plan.json`、`training-brief.json` | `plan.contract.json` |
| `poster-assets.json` | `plan.assets.json` |
| Fabric `poster.poster.json` | 经 migration Tool 生成 `src/variants/001-main.tsx` 与 `data/001-main.json` |
| 海报最终 PNG | `dist/<poster-id>.png` |
| `poster-review.json` | `review.independent.json` |
| deck storyboard/copy/readback | `plan.storyboard.json`、`plan.copy.json`、`plan.readback.json` |
| 集中式 PptxGenJS generator | `src/deck.ts` 加 `src/slides/<NNN>-<slug>.ts` |
| PPTX/PDF/page renders | `dist/<deck-id>.pptx`、`dist/<deck-id>.pdf`、`dist/pages/<NNN>.png` |
| 集中式 Remotion Composition | `src/Video.tsx` 加 `src/scenes/<NNN>-<slug>.tsx` |
| 视频最终 MP4 | `dist/<video-id>.mp4` |
| content credibility `run.json` / `report.md` | `evidence.run.json` / `candidate.report.md` |
| 各类 package/release manifest | `release.manifest.json` |
| 各类最终 receipt 文件 | `receipt.release.json` |

旧名只在迁移 Tool 的输入侧读取；写出后立即使用新名称。新旧名称同时存在时 fail closed，避免 Hook 选错事实源。

## 跨平台实现

每个可安装插件目录自包含：

```text
plugins/<plugin>/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── hooks/claude.json
├── hooks/codex.json
├── scripts/
├── skills/<plugin>-config/SKILL.md
├── tests/
└── acceptance/
```

两端可以共享纯业务 schema、digest 和 validator，但 Hook manifest、事件适配、Tool target 提取和 failure event 必须分平台维护。某端缺少实现 hard 因果链所需的事件或隔离能力时，只降级该端，不用另一端证据冒充。

所有 Codex Tool scripts 设置并读取 `AI_EXPERTS_SESSION_ID`、`AI_EXPERTS_TRIGGER_FROM`。状态写宿主数据目录。项目 `.artifact-delivery.mjs` 是项目拥有的可信 executable config；加载错误必须阻止对应 scope 进入 hard 模式，并给出一次可恢复诊断。

## 实施顺序

1. 实现 runtime 的 artifact root、path parser、role registry、snapshot、generation、CAS 状态机和双宿主事件适配。
2. 先实现 `pptx-project-delivery-guard`：固定工程路径、单页 module、hash preview、build/release，作为完整纵向切片。
3. 实现 Satori/resvg poster adapter 与 Remotion video adapter，复用 project layout、unit source 和 hash preview 模式。
4. 从三条纵向实现中稳定抽取 brief/review 公共插件，避免先抽象后返工。
5. 实现 document；brand 和 learning 在专用 validator 补齐后进入 hard 模式，此前只发布 evidence/advisory 能力。

新旧 Hook 对同一 fixture 给出相同业务判定且双宿主验收闭合后，才能删除旧实现。套件成员共享 runtime 依赖，不复制 receipt、path、hash 或 state-store 代码。

## 验收门槛

### 合同与状态

- schema 拒绝未知版本、重复 `artifactId`、非法 phase 和 generation 冲突；
- path parser 拒绝非法 artifact id、stage、role、index、扩展名和嵌套层级；
- artifact 目录首文件不是 `plan.contract.json`，或 plan carrier/id 与父目录/目录名不一致时阻断；
- path traversal、symlink 切换、非普通文件、超限文件和 hash 漂移 fail closed；
- 同路径覆盖、恢复 mtime、Tool 版本变化仍使旧证据失效；
- 无关文件变化不污染其他 artifact。

### 抗绕过

- `closed` 模式下，未知目标 Bash/custom mutation 在执行前被拒绝；
- `snapshot` 模式下，任意 mutation-capable Tool 后的 scope 变化可被检测并使后续状态失效；
- 手工改名为高阶段文件、伪造 `receipt.release.json` 或制造 index 断号不能推进 stage；
- 新旧命名并存、同一 role 多事实源和未知 role 均 fail closed；
- 跨 session、跨 artifact、跨 generation receipt 和伪造 tag 均无效；
- timeout、非零退出、截断或 subject 不一致的 receipt 不能闭合；
- 自审冒充独立 reviewer、自由文本冒充用户选择、旧截图冒充新 build 均被拒绝；
- slide module import PptxGenJS、调用 `addSlide()`、被 manifest 重复引用或同时生成多页时被拒绝；
- slide source 缺少当前 source-hash preview、保留旧 hash preview 或共享依赖变化后沿用旧 preview 时被拒绝；
- 非登记 Tool 写 `src/slides/*.png`、`dist/`、release 或 receipt 时被拒绝；
- poster variant import Satori/resvg、文件系统或网络客户端，返回多个画布，使用不支持的 CSS，或绕过 render adapter 时被拒绝；
- poster SVG 与 PNG 不来自同一 preview invocation、data/font/asset 漂移后沿用旧 proof，或 Fabric 与 Satori receipt 混用时被拒绝；
- video scene 注册 Composition、调度其他 scene、import renderer、使用 timer/墙钟/无 seed 随机数，或在 render 期访问远程素材时被拒绝；
- scene preview 冒充最终成片证据、Composition still 冒充最终抽帧、probe/sample 不属于当前 MP4 时被拒绝；
- 外部发布发生但 verifier 缺失时只能 `BLOCKED`，不得报告完成。

### 结果级 fixture

- pptx：slide 断号、多页 module、hash preview 过期、锁文件漂移、页数错、缺字体和不可渲染；
- poster：Satori 不支持的元素/CSS、缺字体、远程素材、双 root、SVG/PNG subject 不同、错误尺寸和 profile 漂移；
- document：缺字体、页数错、不可渲染、空白页和文本层损坏；
- video：多 Composition、scene 越界、非确定性时间、远程素材、错误 codec/FPS、转场黑帧、抽帧不属于最终文件和音轨缺失；
- content/learning：引用未绑定、来源变化、练习目标不映射和 readback 过期。

### 双宿主与误阻断

- Claude Code 与 Codex 真实会话分别完成 deny → recovery → allow，不只测脚本单元；
- 普通问答、未激活 carrier、小修、advisory warning 和合规 review-only 状态不误阻断；
- Stop 递归、并发 artifact、状态锁超时和损坏配置都有有界恢复路径；
- 每个插件的验收报告列出 hard 断言、未验证项、实际命令与 receipt provenance。

只有上述门槛全部满足，插件 metadata 才能声明 hard。否则必须明确标记 evidence-only 或 advisory。
