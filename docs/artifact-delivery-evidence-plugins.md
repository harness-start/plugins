# Artifact Delivery Evidence 插件拆分

## 目标

把上游设计与产物交付 Hook 迁移为可独立安装的双平台插件。边界按业务阶段和载体划分，不按文件扩展名或 Skill 数量划分。

硬 Hook 只阻断三类可观察违约：

- 已显式进入受控流程，却绕过必需的 brief、review 或 release 阶段；
- 当前产物已变化，完成态仍引用旧 receipt、旧 hash 或旧 review；
- 回复声称交付完成，但缺少当前 session、最后一次 mutation 之后的有效证据。

主观审美、低置信度启发式指标和未覆盖状态只能形成 warning 或 `unverified`，不能单独触发 fail-closed。

## 组件结构

```text
artifact-evidence-runtime                 内部共享包，不单独安装
├── design-brief-gate                     跨载体：生产前合同
├── design-review-evidence-guard          跨载体：独立审查合同
│
├── static-visual-delivery-guard          海报、封面、社交卡、Banner
├── brand-identity-delivery-guard         Logo、字标、VI、色板、字体
├── interface-delivery-guard              Web、APP、小程序、Dashboard
├── presentation-delivery-guard           Storyboard、PPTX、PDF
├── motion-media-delivery-guard           视频、动效、GIF
└── document-publication-delivery-guard   报告、手册、出版 PDF

content-verification-evidence-guard       非设计：内容可信度核验
learning-experience-delivery-guard        非设计：培训方案与学习资产
```

`artifact-delivery-evidence-gates` 保留为套件名或安装集合，不注册业务 Hook。

## 统一运行模型

```text
显式激活 / 项目配置
→ brief 或 carrier plan
→ editable source
→ candidate render
→ objective validation
→ independent review
→ release Tool 原子发布
→ Stop Hook 核对 receipt、hash 和未验证项
```

激活必须满足其一：

- 用户显式调用对应 Skill、命令或 carrier；
- 项目 `.artifact-delivery.mjs` 将路径映射到 carrier；
- 上游 Tool 创建了带 `artifactId` 的受控状态。

Prompt 关键词只能注入提示，不能直接开启 fail-closed。状态按 `session + workspace + artifactId` 隔离；一个任务可同时激活多个 carrier。

## 共享内核：`artifact-evidence-runtime`

### 迁移内容

- `defineTaggedArtifactCompletionGate`、completion receipt 与 operational facts 读取逻辑；
- workspace revision、最后一次 mutation、Tool invocation provenance；
- canonical relative path、工作区边界、普通文件、symlink、大小和 SHA-256 校验；
- Stop recovery block、阻断次数与递归 Stop 保护；
- stage、确定性校验、atomic publish 和 last-good 保留。

### 数据合同

公共 schema 只保留四个：

- `ArtifactSessionStateV1`：carrier、phase、revision 和 latest mutation；
- `ArtifactPlanV1`：brief、asset manifest、输出角色与 acceptance；
- `ArtifactReviewBundleV1`：review spec、result、reviewer 和 finding；
- `ArtifactReleaseManifestV1`：最终 source/output、receipt、未验证项和发布状态。

`ArtifactReleaseManifestV1` 至少包含：

```text
artifactId, carrier, sourceArtifacts[], outputArtifacts[],
workspaceRevision, validatorReceipts[], reviewSpec, reviewResult,
accessibilityEvidence, unverified[], releaseStatus
```

每个文件 proof 包含规范相对路径、角色、size、SHA-256。每个 receipt 包含 `toolId`、`invocationId`、validator 版本、subject digest、时间、exit code 和 session provenance。

### 硬 Hook 工厂

| Hook | 硬条件 | 恢复 |
| --- | --- | --- |
| `ToolBefore` | release Tool 的 brief、candidate 或 review 前置状态缺失 | 完成缺失阶段后重试原 Tool |
| `ToolAfter` | 不阻断；记录 mutation/receipt，任何 source/output 变化都使旧 release/review 失效 | 重新渲染和复核 |
| `Stop` | 成功完成态没有 fresh receipt，或 manifest/path/hash/subject 不一致 | 修复产物，重跑 validator/release，保留原回复重试 |

Stop 不运行浏览器、Office、编码器或模型审查，只做有界复核。

## 跨载体插件

### `design-brief-gate`

职责：确认生产前输入足够，不验证最终成品。

工作流：

```text
激活 carrier
→ 生成 DesignBriefV1 / AssetManifestV1
→ design-brief-validate
→ 解锁 carrier source/output mutation
```

brief 固定受众、用途、载体、尺寸、输出数量、内容状态、品牌约束、素材许可、编辑性、无障碍计划和失败成本。整体重做、品牌升级或参考方向冲突时，还要有 2–3 个真实候选及用户选择证据。

硬 Hook：

- `ToolBefore`：仅在流程已显式激活且任务标记 `planRequired=true` 时，阻断 brief 路径以外的首次生产写入；小修不触发。
- `Stop`：声称 brief/方案完成时，要求当前 session 的 validator receipt 和 brief tag。
- brief 不完整但无需继续生产时，允许 `NEEDS_CONTEXT`，不得伪造默认值闭合。

迁移：`design-accessibility-plan-check`、visual brief、deck/video storyboard 的共同输入合同。

### `design-review-evidence-guard`

职责：证明审查覆盖和证据来源，不替载体判断发布结构。

工作流：

```text
candidate + sha256
→ ReviewSpecV1(samples, criteria, coverage)
→ objective measurement / image-model observation
→ ReviewResultV1
→ visual-evidence-gate
```

硬 Hook：

- required objective criterion 未满足，可 fail-closed；必须给出测量值、阈值、subject 和 evidence locator。
- heuristic/semantic 只能 warning；只有项目合同把它声明为 required acceptance 时，缺失证据才阻断，不能按平均分阻断。
- artifact 或 spec hash 改变后，旧 review 立即失效。
- producer 不能给自己的 blocker/major finding 提供最终复验 receipt。
- `DONE_WITH_CONCERNS` 只允许 review-only 任务，并必须列出未关闭 finding。

迁移：browser layout audit、design lint、perceptual audit、visual evidence gate、accessibility evidence gate。

## 载体交付插件

### `static-visual-delivery-guard`

范围：海报、封面、Banner、OG 图、社交卡和多页卡组。

工作流：brief → template/source → render → lint → set validation → package → review → release。

硬 Hook：

- release Tool 拒绝尺寸、比例、格式、透明通道、颜色空间、字体/图片来源或集合顺序不符合 carrier plan 的候选；
- 多页集合任一必需成员失败，不生成集合级成功 receipt；
- Stop 要求 editable source、最终输出、缩略图/原尺寸抽查、review 和 release manifest 哈希闭合；
- 无真实 render 时只能报告未验证，不能用源码 lint 代替成品验收。

迁移：`poster-template-engine` 的 scaffold/render/lint/package-verify，以及 `social-card-authoring` 的 set-validate/set-package。

### `brand-identity-delivery-guard`

范围：Logo、中文字标、图形标、VI、标准色、字体系统。

工作流：brand brief → master vector → variant matrix → size/background strips → color/font proof → VI package → independent review → release。

硬 Hook：

- release 前必须有 master vector、主标/组合版本、单色、反白和小尺寸 proof；
- SVG viewBox、结构、实际像素占用、输出尺寸与 manifest 不一致时阻断；
- 字体、图片或第三方图形缺少许可/来源时阻断发布；
- 色值、ICC/profile 或导出包与 VI 手册不一致时阻断；
- semantic 品牌匹配不做客观打分，只要求具名 review evidence。

迁移：logo preview strip、lettering SVG 工具、color management、logo audit、VI/字体 references。

### `interface-delivery-guard`

范围：Web、管理端、Dashboard、Flutter、SwiftUI、Compose、React Native、Taro 和微信小程序。

工作流：brief → source/build → viewport/state plan → real render → layout snapshot → a11y/objective audit → perceptual review → release。

硬 Hook：

- Stop 要求声明的 viewport/state 均有 screenshot 与 layout snapshot hash；
- 横向溢出、核心内容裁切、明确契约下的低对比/小目标等 objective finding 阻断；
- focus、keyboard、reflow、text-spacing、loading/error/empty、长文本和国际化未覆盖时必须进入 `unverified`；
- 静态截图不能证明交互、响应式或辅助技术状态；
- source revision 变化后所有旧截图、snapshot 和 review 失效。

迁移：design-review browser audit、前端 design lint、各 interface-design Skill 的 profile 和 design accessibility evidence。

### `presentation-delivery-guard`

范围：故事板、汇报 Deck、培训课件、原生 PPTX 和同源 PDF。

工作流：

```text
DeckBrief + Storyboard + LearnerReadback
→ preproduction validate
→ candidate PPTX build
→ PPTX/PDF/page renders
→ structure + visual review
→ release manifest
```

硬 Hook：

- Storyboard 完成态要求 brief、storyboard、copy/readback 和 fresh validator receipt；
- candidate 完成态要求 build manifest、候选 PPTX 和 readback hash；
- release 完成态要求 editable PPTX、同源 PDF、逐页 render、结构报告、视觉/无障碍证据和精确 hash；
- 高风险方向变更没有 2–3 个候选及用户选择证据时阻断 release；
- 页面越界、字体缺失、不可渲染、页数或输出绑定不一致时阻断。

迁移：`deck-storyboard-completion-gate`、`pptx-build-completion-gate`、`pptx-completion-gate` 及其 validators。

### `motion-media-delivery-guard`

范围：视频分镜、Remotion/Manim 成片、Logo 动效和 GIF。

工作流：storyboard → source/timeline → render → media probe → frame/timecode sample → continuity/a11y review → release。

硬 Hook：

- storyboard 任务要求 storyboard validator；制作任务额外要求最终媒体 probe 和 frame sample；review-only 任务要求 probe 和 sample；
- final hash、duration、FPS、分辨率、codec、音轨或字幕合同不符时阻断；
- 抽帧必须来自最终编码成片，并绑定 frame/timecode/hash；
- 字幕安全区、缺帧、黑帧、音轨缺失等 objective finding 阻断；节奏和审美只要求定位明确的 review evidence；
- Stop 不编码、不抽帧，只核对当前 receipt。

迁移：`video-production-evidence-gate`、video storyboard validate、media probe、frame sample、render/add-audio Tool。

### `document-publication-delivery-guard`

范围：技术报告、方案书、手册、宣传册和出版 PDF。

工作流：source → deterministic build → PDF probe → full-page render → text/font/link/a11y audit → review → release。

硬 Hook：

- source 与 PDF、页数、字体、链接、目录和逐页 render hash 不闭合时阻断；
- 页面裁切、缺字、空白页、损坏文本层或必需字体未嵌入时阻断；
- 无全量逐页 render 时不能声称版面验收完成；
- 印刷与屏幕版本必须分别声明颜色配置和输出角色。

迁移：`md-to-pdf` Tool，以及 PPT/PDF 中可复用的 page render、font 和 path confinement 逻辑。

## 移出设计套件的插件

### `content-verification-evidence-guard`

迁移 `content-credibility-completion-gate`。它验证 claim、source snapshot、run JSON、确定性 Markdown 和引用绑定，业务目标是事实可信度，不是视觉交付。

工作流：source snapshot → claim extraction → verification run → deterministic report → run/report binding → completion。

硬 Hook：run/report hash、来源快照或 fresh validator receipt 缺失时阻断内容核验完成态。

### `learning-experience-delivery-guard`

迁移 `training-program-completion-gate`、TrainingBrief、练习资产和 learner readback。它验证受众、目标、时长、练习、反馈和评估闭环，不归入 PPT 载体插件；若同时交付课件，再组合 `presentation-delivery-guard`。

工作流：TrainingBrief → curriculum/exercise assets → learner readback → validation → delivery；课件作为独立 presentation artifact 组合验收。

硬 Hook：TrainingBrief 或必需学习资产不完整时阻断方案完成态；只有课件文件问题交给 presentation 插件。

## 跨平台实现

每个插件目录自包含：

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

两端共享业务脚本，Hook manifest 分平台维护。所有脚本设置并读取 `AI_EXPERTS_SESSION_ID`、`AI_EXPERTS_TRIGGER_FROM`；状态写宿主插件数据目录，不写插件安装目录。项目配置使用可信 `import()`，损坏时保留内置安全基线并输出一次警告。

## 迁移总表

| 上游能力 | 目标 |
| --- | --- |
| tagged artifact gate、receipt、operational facts、path/hash | `artifact-evidence-runtime` |
| `design-accessibility-completion-gate` | 拆到 brief、review 和各 carrier；删除总门禁 |
| accessibility plan/evidence、browser/perceptual/visual review | `design-brief-gate`、`design-review-evidence-guard` |
| poster render/package、social card set | `static-visual-delivery-guard` |
| logo、lettering、VI、color/font evidence | `brand-identity-delivery-guard` |
| Web/mobile/miniprogram layout 与 a11y evidence | `interface-delivery-guard` |
| deck storyboard、PPTX build/release | `presentation-delivery-guard` |
| video storyboard、probe、frame sample、render | `motion-media-delivery-guard` |
| `md-to-pdf` 与 page/font audit | `document-publication-delivery-guard` |
| content credibility run/report | `content-verification-evidence-guard` |
| TrainingBrief、exercise、learner readback | `learning-experience-delivery-guard` |

## 实施顺序

1. 抽取 `artifact-evidence-runtime` 和四个公共 schema。
2. 实现 `design-brief-gate`、`design-review-evidence-guard`。
3. 迁移 static visual 与 presentation，验证单图、集合、storyboard、build、release 五条状态链。
4. 实现 interface，再迁移 brand、motion、document。
5. 最后拆出 content verification 与 learning experience。

每个插件单独进入 Marketplace，不互相复制 receipt、path、hash 或 state-store 实现。需要整套能力时由安装脚本选择套件成员。

## 验收门槛

- 单元：状态转换、旧 receipt、最后 mutation、path traversal、symlink、伪造 tag、重复 artifactId、hash 漂移和递归 Stop。
- 负例：普通问答、小修、未激活 carrier、heuristic warning 和合法 `DONE_WITH_CONCERNS` 不误阻断。
- 双宿主：Claude/Codex 真实会话先触发 deny，再按 recovery 补证并放行，同时检查最终文件、manifest 和 Hook 信号。
- 迁移完成：新旧实现对相同 fixture 给出相同业务判定；删除旧 Hook 前，Registry 缺席断言和 Marketplace 验收均闭合。
