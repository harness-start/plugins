# artifact-production

`artifact-production` 通过源码优先流水线创建可复核的视觉、视听、文档和学习制品。它覆盖 logo、图表、海报、演示、印刷出版物、视频、器乐和培训包，面向 Claude Code 与 Codex。

## 用途

生产制品不只是写出一个二进制文件。可信交付需要可编辑源、明确方向、确定性 writer、可测量探针、独立评审边界，以及绑定当前输入输出的发布回执。本 owner 提供这些端到端合同，同时把只读顾问与 writer、发布权分开。

## 设计

`src/domains/` 下有八个生产域：`logo`、`diagram`、`poster`、`presentation`、`print`、`video`、`music` 和 `training`。每个域拥有自己的源合同、生成路径、writer、Hook 保护、证据、独立评审输入和发布校验。owner 为每个宿主提供一个 Hook dispatcher，以及一套把 `<resource> <action>` 在进程内路由到负责域的统一公开 CLI。

Skill 拥有艺术方向、规划、编排和视觉或听觉判断。Hook 拥有机械规则：保护生成输出、只接纳已注册 writer、把证据绑到当前字节、保持评审独立，并阻断不完整的发布声明。安装 owner 即激活全部格式；没有能力 profile，也不要求外部 Skill。

## 能力

| 模块 | 产出 | 核心工作流 |
| --- | --- | --- |
| `logo` | 原生矢量主稿、变体、构造/样本页、预览和导出 | Brief → 品牌方向 → 构造 → 变体 → 预览 → 独立评审 → 发布 |
| `diagram` | SVG、PNG、HTML 以及兼容 draw.io 的图表项目 | 语义源/导入 → 设计 → 渲染 → 探针 → 独立评审 → 发布 |
| `poster` | 确定性海报 SVG/PNG 变体 | Brief/艺术方向 → Satori 源 → 渲染 → 可读性/构图证据 → 独立评审 → 发布 |
| `presentation` | 可编辑 16:9 PPTX、渲染页和 PDF | 需求 → 分镜 → 设计系统 → PptxGenJS 源 → 渲染/探针 → 独立评审 → 发布 |
| `print` | 静态出版物 HTML/PDF 包 | 有序出版章节 → lint → PDF 证据 → 独立评审覆盖 → 发布 |
| `video` | 证据绑定的 Remotion 视频与已准入媒体 | 方向/分镜 → 媒体准入 → 镜头编排 → 渲染 → 视听探针 → 独立评审 → 发布 |
| `music` | 代码管理的器乐项目、混音和分轨 | 参考分析 → 作曲/编曲 → Tone.js 渲染 → 响度/混音证据 → 独立试听 → 发布 |
| `training` | 议程、讲师/学员材料、练习、评估和交付包 | 受众/成果 → 教学设计 → 材料渲染 → 标准完备的评审 → 发布 |

只读顾问 Skill 覆盖品牌方向、颜色/无障碍、logo 形态、图表/海报/幻灯/视频批判、学术与地域文化海报方向、演示分镜、音乐作曲/参考/混音质检、视频运动/媒体/镜头规划，以及培训评审。编排与评审 Skill 有明确的 writer 权限边界。

## 适用场景

请求的交付物属于受支持的制品家族，并且必须保持可编辑、可复现、可复核、可发布时使用。适合创建新品牌标志、架构图、活动海报、幻灯片、静态出版物、短说明或产品视频、器乐，或结构化培训项目。

已有制品需要评估且不要改写时，使用只读批判 Skill。独立评审 Skill 只应在另一会话已经产出当前渲染输出和证据之后使用。

## 不适用场景

不要把它用于普通应用 UI；那是 `interface-design`。不要只用它解释视觉概念、就地编辑不受支持的专有文件，或生产没有源/证据合同的一次性二进制。PPTX 工作流创建新幻灯片，不是任意已有模板编辑器。音乐工作流不是通用 DAW 控制器；视频工作流不调用厂商媒体生成 API，也不接受未声明权利的素材。

合同要求独立评审时，不要让生产会话自我批准制品。仅有渲染文件不是发布。

## 运行时行为

`SessionStart` 以 `session` 参数调用全部八个格式域，发现已有项目，不激活无关硬门禁。Claude Code 的 `SubagentStart` 只路由到 `logo:brand-logo-production`，参数为 `subagent`：把该子 agent 标为独立 logo 评审的受信任主体，而不是再跑一遍八个格式的会话发现。`PreToolUse` 在范围内的受治理制品项目中保护生成输出，并把改写限制为已注册、能力绑定的 writer。Shell 范围要求命令或当前目录识别载体路径；仅仅存在已有或已发布的制品项目，不会把无关的仓库根解释器变成制品改写。`PostToolUse` 和失败事件更新证据或恢复信息。`Stop` 与 `SubagentStop` 校验活动项目声明的阶段，当前证据、评审或发布回执缺失时阻止虚假完成声明。

dispatcher 只评估 matcher 适用的路由。域由制品路径和项目合同限定范围，因此安装这个全开 owner 不会让每种格式校验器去跑仓库里的每一次写入。Hook 激活或格式正确的文件不是视觉质量证明；仍需要渲染输出和结果级评审。

## 公开接口

确定性 CLI 协议是：

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

支持的资源和动作：

| 资源 | 动作 |
| --- | --- |
| `logo` | `advice`、`lint`、`lock`、`preview`、`release`、`render`、`review`、`stage`、`validate` |
| `diagram` | `import`、`init`、`lint`、`probe`、`release`、`render`、`review` |
| `poster` | `init`、`lint`、`probe`、`release`、`render`、`review` |
| `presentation` | `init`、`lint`、`probe`、`release`、`render`、`review` |
| `print` | `lint`、`release` |
| `video` | `admit`、`catalog`、`init`、`lint`、`probe`、`release`、`render`、`review`、`shot-stage` |
| `music` | `advice`、`init`、`lint`、`optimize`、`preview`、`reference`、`release`、`render`、`review`、`stage` |
| `training` | `init`、`lint`、`release`、`render`、`review` |

主要公开编排/评审 Skill 是 `logo-project-authoring`、`logo-project-review`、`diagram-project-authoring`、`diagram-project-review`、`poster-project-authoring`、`poster-project-review`、`pptx-deck-authoring`、`pptx-deck-review`、`video-project-authoring`、`video-project-review`、`music-project-authoring`、`music-project-review`、`training-program-design` 和 `training-program-review`。窄顾问 Skill 列在 `skills/` 中，并自行描述只读边界。

本 owner 不暴露 MCP 服务器。

## 配置与状态

受治理项目位于 `artifacts/<format>/<artifact-id>/`，包含格式特定的源合同、交付日志、渲染输出、探针、评审输入和发布回执。writer 用 digest 把证据绑到当前源和生成字节。部分格式通过注册命令准入外部资产或参考，使出处和权利声明留在项目记录里。

插件只存储各生产合同所需状态。发布后不依赖开发工作区缓存或全局安装的 Skill。owner 生成的 `dist/` 运行时已提交，并与完整 owner 及共享 core TypeScript 源做哈希绑定。

## 边界

确定性 writer 和探针可以确立文件形态、字节身份、尺寸、时序、响度、清单一致性和合同完备性。它们本身不能确立品味、创意内容的事实正确性、法律许可、受众效果或无障碍。独立评审提供人/模型判断，但仍受提交证据和渲染样本约束。

插件不保证每种外部渲染器、字体、编解码器、浏览器、Office 安装或媒体工具都在场。缺失的可选工具必须带着恢复路径报告，而不是伪造输出。发布回执确立可观察的工作流完整性，不是法律批准，也不是对抗恶意同用户进程的抗篡改签名。

## 验证

```bash
node --import tsx --test \
  plugins/artifact-production/tests/*.test.ts \
  plugins/artifact-production/tests/domains/**/*.test.ts
npm run check:dist
```

特定格式的真实渲染测试可能需要 FFmpeg、浏览器、字体或 Office 工具。Claude Code 与 Codex 实时验收必须通过 Docker 中的 `./scripts/acceptance/run.sh --plugin artifact-production` 运行。
