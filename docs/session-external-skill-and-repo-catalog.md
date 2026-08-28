# 本仓库 Codex / Grok 会话中的外部仓库与 Skill 目录

扫描日期：2026-08-17。对象是本仓库工作区 `/srv/workspaces/work/harness-start/plugins` 的 Codex CLI 与 Grok 会话历史，不是全机所有项目。

这份目录回答两件事：会话里实际点名或检索过哪些外部 Skill / 仓库，以及它们后来有没有写进当前的 `plugins/*/skill-deps.json` 与 `vendor-skills/`。

## 1. 扫描范围

| 来源 | 数量 | 位置 |
| --- | ---: | --- |
| Codex 会话 | 85 | `~/.codex/sessions/**/rollout-*.jsonl`，`cwd` 为本仓库或父目录 `harness-start` |
| Grok 会话 | 131 | `~/.grok/sessions/%2Fsrv%2Fworkspaces%2Fwork%2Fharness-start%2Fplugins/` 下的 `chat_history.jsonl` |
| 时间窗 | 2026-08-05 ~ 2026-08-17 | 最早 Grok 会话约 08-05，最晚 Codex 会话约 08-17 |

抽取方式：从用户消息、助手回复和工具输出中匹配 `skills.sh/...`、`github.com/owner/repo`、以及少量官方文档 URL。对照了当前仓库的 `plugins/*/skill-deps.json`（75 条声明、71 个唯一 Skill）和 `vendor-skills/index.json`（71 个已 vendor 的 Skill）。

未纳入：

- Claude Code 会话（用户只要求 Codex / Grok）
- 其他工作区的 Grok/Codex 会话（例如 `infra/harness-starter`、`infra/ai-experts`）
- `node_modules`、许可证页、GitHub 附件、示例占位 `owner/repo` 一类噪声

信号强弱：

- **用户点名**：用户消息里直接给出 URL 或 Skill 名。这是最高信号。
- **助手检索**：助手为完成用户任务去 skills.sh / GitHub 搜索后反复出现。中等信号。
- **工具回显**：网页抓取、`npx skills find`、文档示例。单独出现时只作候选，不当成“本仓库采用了它”。

## 2. 先看结论

会话里真正反复驱动设计的外部来源并不多，大致是五条线：

1. **工程方法**：`obra/superpowers`（TDD、系统调试、验证后再完成、subagent 驱动开发）和 `mattpocock/skills`（TDD 后来被 Superpowers 替换；研究、handoff、grilling 留下了）。
2. **Skill 发现**：`vercel-labs/skills` 的 `find-skills`，以及目录站 [skills.sh](https://www.skills.sh/)。
3. **工程师思维 / 去 AI 味**：`szkocot/andrej-karpathy-skills`、`JuliusBrussee/caveman`、`blader/humanizer`、`hardikpandya/stop-slop`、`op7418/Humanizer-zh`、`MrGeDiao/shuorenhua`。
4. **设计交付**：`pbakaus/impeccable` 被要求覆盖全部设计工作；PPT / 海报 / Logo / 视频 / 音乐各自引入一批社区 Skill。
5. **内部对照仓**：本机 `/srv/workspaces/work/infra/harness-starter` 和 `/srv/workspaces/work/infra/ai-experts` 被多次当作 hooks 与插件拆分的参考实现。它们不是公开 Skill 仓，但会话里的引用密度很高。

后面按主题列出仓库和 Skill。落地状态以 **2026-08-17 工作树** 为准：`skill-deps.json` 有声明记为“已声明”；`vendor-skills/index.json` 有条目记为“已 vendor”。新领域插件声明的社区 Skill 已全部进入 vendor 快照。

## 3. 用户点名的 Skill 与仓库

这些是用户在 Codex 会话里直接给出链接或名字的条目。按当时任务分组。

### 3.1 工程方法、验证、调试、子代理

| Skill / 入口 | 来源 | 用户怎么用 | 当前落地 |
| --- | --- | --- | --- |
| `tdd` | [mattpocock/skills/tdd](https://www.skills.sh/mattpocock/skills/tdd) | 先指定为验证方案的社区对照 | 未声明。随后被 Superpowers TDD 替换 |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | 与 TDD、本仓库 verification 插件一起规划硬流程 | 已声明并 vendor：`engineering-practice`、`ci-gated-delivery` |
| `test-driven-development` | [obra/superpowers/test-driven-development](https://www.skills.sh/obra/superpowers/test-driven-development) | 明确要求改用这一套，不要再用 mattpocock 的 TDD | 已声明并 vendor：`test-driven-development` |
| `systematic-debugging` | [obra/superpowers/systematic-debugging](https://www.skills.sh/obra/superpowers/systematic-debugging) | 语言无关调试插件的主参考 | 调试工作流现仅由 `software-debugging` 承担；`engineering-practice` 不再发布调试 Skill |
| `debug` | [anthropics/knowledge-work-plugins/debug](https://www.skills.sh/anthropics/knowledge-work-plugins/debug) | 调试插件对照 | 未声明 |
| `debugging-strategies` | [wshobson/agents/debugging-strategies](https://www.skills.sh/wshobson/agents/debugging-strategies) | 调试插件对照 | 未声明 |
| `subagent-driven-development` | [obra/superpowers/subagent-driven-development](https://www.skills.sh/obra/superpowers/subagent-driven-development) | 完善当时的 `subagent-discipline` | 未以同名声明。同主题后来也看过 neolabhq 版本 |
| `subagent-driven-development` | [neolabhq/context-engineering-kit](https://www.skills.sh/neolabhq/context-engineering-kit/subagent-driven-development) | 要求做成日常可用的 subagent 插件 | 未声明 |
| `dispatching-parallel-agents` | [obra/superpowers/dispatching-parallel-agents](https://www.skills.sh/obra/superpowers/dispatching-parallel-agents) | 要求并入 subagent 任务 | 未声明 |
| `handoff` | [mattpocock/skills/handoff](https://www.skills.sh/mattpocock/skills/handoff) | 作为子代理交接合同 | 已声明并 vendor：`evidence-based-research` |
| `brainstorming` | [obra/superpowers](https://github.com/obra/superpowers) | 助手侧高频，后写入意图发现 | 已声明并 vendor：`intent-discovery` |
| `requesting-code-review` / `finishing-a-development-branch` | [obra/superpowers](https://github.com/obra/superpowers) | 助手检索后进入交付闭环插件 | 已声明并 vendor：`ci-gated-delivery` |

### 3.2 Skill 发现与研究

| Skill / 入口 | 来源 | 用户怎么用 | 当前落地 |
| --- | --- | --- | --- |
| 目录站 | [skills.sh](https://www.skills.sh/) | 多次要求“联网或从 skills.sh 找流行、能用 hooks 强化的 Skill” | 发现入口，不是可 vendor 的单个 Skill |
| `find-skills` | [vercel-labs/skills/find-skills](https://www.skills.sh/vercel-labs/skills/find-skills) | 要求读源码，并围绕它设计 hooks | 未声明。Grok 会话也单独做过 hooks 设计 |
| `grill-me` / `grilling` | [mattpocock/skills/grill-me](https://www.skills.sh/mattpocock/skills/grill-me) | Grok 做过 hooks 自动化设计；后来以 `grilling` 落地 | 已声明并 vendor：`work-reporting` |
| `research` | [mattpocock/skills](https://github.com/mattpocock/skills) | 用户把方向收束到 research 插件 | 已声明并 vendor：`evidence-based-research` |
| `arxiv-search` | [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | research 数据源扩展 | 已声明并 vendor |
| `firecrawl` | [firecrawl/cli](https://github.com/firecrawl/cli) | research 数据源扩展 | 历史参考；不再随插件发布，运行时改用宿主内建联网搜索 |

### 3.3 工程师思维与去 AI 味

| Skill / 入口 | 来源 | 用户怎么用 | 当前落地 |
| --- | --- | --- | --- |
| `karpathy-guidelines` | [szkocot/andrej-karpathy-skills](https://www.skills.sh/szkocot/andrej-karpathy-skills/karpathy-guidelines) | “工程师思维”插件 SessionStart 必载 | 已声明并 vendor：`engineering-practice` |
| Karpathy 技能包（另一 fork） | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | 更早一次“引入这类指导性 Skill” | 未声明。后来改用 szkocot 源 |
| `caveman` | [JuliusBrussee/caveman](https://www.skills.sh/juliusbrussee/caveman/caveman) | 工程师思维插件指定 | 已声明并 vendor：`professional-writing` |
| `triage` | [mattpocock/skills/triage](https://www.skills.sh/mattpocock/skills/triage) | 工程师思维插件指定 | 未声明 |
| `humanizer` | [blader/humanizer](https://github.com/blader/humanizer) | 英文去 AI 味 | 已声明并 vendor |
| `stop-slop` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | 英文去 AI 味 | 已声明并 vendor |
| `humanizer-zh` | [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 中文去 AI 味 | 已声明并 vendor |
| `shuorenhua` | [MrGeDiao/shuorenhua](https://github.com/MrGeDiao/shuorenhua) | 中文去 AI 味 | 已声明并 vendor |
| `ai-flavor-remover` / `remove-ai-style` | 用户点名 `ai-flavor-remover`；仓库侧落到 [zc277584121/marketing-skills](https://github.com/zc277584121/marketing-skills) | 中文去 AI 味 | 已声明并 vendor：`remove-ai-style` |
| `show-me` | [humanlayer/skills](https://www.skills.sh/humanlayer/skills/show-me) | Research how to make explanations easier to understand | Adapted as `professional-writing:visual-explanation`; does not create or open HTML by default |
| `i-have-adhd` | [ayghri/i-have-adhd](https://www.skills.sh/ayghri/i-have-adhd/i-have-adhd) | Research how to reduce reading and execution friction | Adapted as `professional-writing:actionable-response`; adds no diagnosis or session identity assumption |

### 3.4 设计总则、PPT、海报、Logo

| Skill / 入口 | 来源 | 用户怎么用 | 当前落地 |
| --- | --- | --- | --- |
| `impeccable` | [pbakaus/impeccable](https://www.skills.sh/pbakaus/impeccable/impeccable) | “全面引入，用于所有设计相关工作” | 已声明并 vendor：海报 / 演示 / 视频 |
| `pptx-generator` | [MiniMax-AI/skills](https://www.skills.sh/minimax-ai/skills/pptx-generator) | 用户认为比 siril9 更符合 PPT 需求 | 已声明并 vendor：`presentation-production` |
| `pptx` | [anthropics/skills/pptx](https://www.skills.sh/anthropics/skills/pptx) | 要求一并评估 | 未声明 |
| `presentation-skill` | [siril9/presentation-skill](https://github.com/siril9/presentation-skill) | 用户明确说不够好 | 未采用 |
| `regional-culture-poster` | [dacnay816y62-hub/regional-culture-poster](https://www.skills.sh/dacnay816y62-hub/regional-culture-poster/regional-culture-poster) | 国风海报，用户标为十分重要 | 已声明并 vendor |
| `cvpr-2026-poster` | [yunyiliu/cvpr-2026-poster-skill](https://www.skills.sh/yunyiliu/cvpr-2026-poster-skill/cvpr-2026-poster) | 海报插件候选 | 已声明并 vendor |
| `qiaomu-mondo-poster-design` | [joeseesun/qiaomu-mondo-poster-design](https://www.skills.sh/joeseesun/qiaomu-mondo-poster-design/qiaomu-mondo-poster-design) | Mondo 风格海报 | 已声明并 vendor |
| `magazine-poster` | [nexu-io/open-design](https://www.skills.sh/nexu-io/open-design/magazine-poster) | 海报对照 | 未声明 |
| `brand-identity` | [arnabbagxd/Brand-building-skills](https://github.com/arnabbagxd/Brand-building-skills) | Logo 编排增强时引入 | 已声明并 vendor |
| `color-expert` | [meodai/skill.color-expert](https://github.com/meodai/skill.color-expert) | Logo / 色彩 | 已声明并 vendor |
| `logo-generator` | [op7418/logo-generator-skill](https://github.com/op7418/logo-generator-skill) | Logo | 已声明并 vendor |
| `logo-design` | [seb1n/awesome-ai-agent-skills](https://github.com/seb1n/awesome-ai-agent-skills) | Logo | 已声明并 vendor |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 设计检索高频（约 28 个会话） | 未声明 |

### 3.5 视频、音乐

| Skill / 仓库 | 来源 | 用户怎么用 | 当前落地 |
| --- | --- | --- | --- |
| OpenMontage 技能包 | [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | 视频插件增强清单 | 未声明 |
| `video-production-skills` | [Pluviobyte/video-production-skills](https://github.com/Pluviobyte/video-production-skills) | 同上 | 未声明 |
| `chengfeng-cut` / `chengfeng-subtitle` | [Agentchengfeng/chengfeng-videocut-skills](https://github.com/Agentchengfeng/chengfeng-videocut-skills) | 同上 | 已声明并 vendor |
| `huashu-skills` | [alchaincyf/huashu-skills](https://github.com/alchaincyf/huashu-skills) | 同上 | 未声明 |
| `Video-Wrapper-Skills` | [op7418/Video-Wrapper-Skills](https://github.com/op7418/Video-Wrapper-Skills) | 同上 | 未声明 |
| `model-selector` 等 | [cclank/lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) | 同上 | 已声明并 vendor |
| `Micro-Drama-Skills` | [zhaihao118/Micro-Drama-Skills](https://github.com/zhaihao118/Micro-Drama-Skills) | 同上 | 未声明 |
| `motion-skills` | [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) | 用户点的是这个仓名 | 未按此仓声明。落地的是同作者的 `motion-design-skills` / `tiktok-video-skills` / `explainer-video-skills` |
| `poxiaoxing-skills` | [GanymedeNil/poxiaoxing-skills](https://github.com/GanymedeNil/poxiaoxing-skills) | 同上 | 未声明 |
| `musical-dna` | [jwynia/agent-skills](https://www.skills.sh/jwynia/agent-skills/musical-dna) | 要求引入音乐插件 | 已声明并 vendor |
| `music-composition` | [SJY051/music-composition](https://github.com/SJY051/music-composition) | 音乐编排检索 | 已声明并 vendor |
| `miaoxiang-music` | [all666666all/miaoxiang-music.skill](https://github.com/all666666all/miaoxiang-music.skill) | 音乐编排检索 | 已声明并 vendor |
| `media-os` 工作流 | [damionrashford/media-os](https://github.com/damionrashford/media-os) | 音乐编排检索 | 已声明并 vendor |

### 3.6 规格驱动开发（助手检索，用户未逐条点名）

PPT / 工程重构相关会话里，助手还对比过一批 SDD 仓。它们出现在 Codex 用户上下文中（工具结果回灌），但不是用户亲口点的采用清单：

| 仓库 | 会话角色 | 当前落地 |
| --- | --- | --- |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | SDD 对照，后写入 `spec-driven-development` | 已声明并 vendor |
| [codervisor/leanspec](https://github.com/codervisor/leanspec) | 对照 | 未声明 |
| [gemini-cli-extensions/conductor](https://github.com/gemini-cli-extensions/conductor) | 对照 | 未声明 |
| [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) | 对照 | 未声明 |
| [Priivacy-ai/spec-kitty](https://github.com/Priivacy-ai/spec-kitty) | 对照 | 未声明 |
| [gotalab/cc-sdd](https://github.com/gotalab/cc-sdd) | 对照 | 未声明 |
| [zhu1090093659/spec_driven_develop](https://github.com/zhu1090093659/spec_driven_develop) | 对照 | 未声明 |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 对照 | 未声明 |

## 4. 按主题汇总的外部 Skill 仓库

下面按“仓库”收口。会话次数来自本轮扫描（同一会话里用户 / 助手 / 工具重复出现会合并为 1）。只保留 Skill 仓或明确被当 Skill 源使用的仓。

### 4.1 方法、验证、调试、交接

| 仓库 | 会话数（约） | 点过的 Skill | 落地插件 |
| --- | ---: | --- | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | 27 | `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `subagent-driven-development`, `dispatching-parallel-agents`, `brainstorming`, `requesting-code-review`, `finishing-a-development-branch`, `writing-plans`, `executing-plans` | `test-driven-development`, `software-debugging`, `engineering-practice`, `intent-discovery`, `ci-gated-delivery` |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 69 | `tdd`（后弃用）, `research`, `handoff`, `grilling` / `grill-me`, `triage`, `code-review`, `domain-modeling`, `diagnosing-bugs`, `to-prd`, `implement`, `qa`, `wayfinder`, `zoom-out` | `evidence-based-research`, `work-reporting` |
| [neolabhq/context-engineering-kit](https://github.com/neolabhq/context-engineering-kit) | 1+ | `subagent-driven-development`, `tdd` | 无 |
| [wshobson/agents](https://github.com/wshobson/agents) | 7 | `debugging-strategies`, `visual-design-foundations` | 无 |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) | 5 | `debug`, `start`, `competitive-analysis` | 无 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 11 | `spec-driven-development`, `test-driven-development` | `spec-driven-development` |

### 4.2 发现、目录、官方技能包

| 仓库 / 站点 | 会话数（约） | 说明 | 落地 |
| --- | ---: | --- | --- |
| [skills.sh](https://www.skills.sh/) | 多次用户点名 | 社区 Skill 目录，后续大量候选都从这里搜 | 发现入口 |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | 10 | `find-skills` | 未声明 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 12 | `vercel-react-best-practices`、`vercel-composition-patterns` 等 | 已声明并 vendor：`web-frontend-engineering` |
| [anthropics/skills](https://github.com/anthropics/skills) | 14 | `pptx`, `brand-guidelines`, `theme-factory`, `webapp-testing` | 未声明 |
| [openai/skills](https://github.com/openai/skills) | 4 | 官方技能包 | 未声明 |
| [openai/plugins](https://github.com/openai/plugins) / [openai/role-specific-plugins](https://github.com/openai/role-specific-plugins) | 8 / 1 | 官方插件与角色包 | 未声明 |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | 4 | `brag-sheet`, `performance-review-writer`, Java 技能 | 已声明：`work-reporting`、`java-engineering` |

### 4.3 写作与去 AI 味

| 仓库 | 会话数（约） | Skill | 落地 |
| --- | ---: | --- | --- |
| [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | 6 | `caveman` | `professional-writing` |
| [blader/humanizer](https://github.com/blader/humanizer) | 5 | `humanizer` | 同上 |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | 4 | `stop-slop` | 同上 |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 4 | `humanizer-zh` | 同上 |
| [MrGeDiao/shuorenhua](https://github.com/MrGeDiao/shuorenhua) | 4 | `shuorenhua` | 同上 |
| [zc277584121/marketing-skills](https://github.com/zc277584121/marketing-skills) | 4 | `remove-ai-style` | 同上 |
| [wangjiawei508/workwise](https://www.skills.sh/wangjiawei508/workwise/ai-flavor-remover) | 1 | `ai-flavor-remover` | 未声明；同主题落到 marketing-skills |
| [humanlayer/skills](https://github.com/humanlayer/skills) | 1 | `show-me` | Adapted as `professional-writing:visual-explanation` |
| [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | 1 | `i-have-adhd` | Adapted as `professional-writing:actionable-response` |

### 4.4 设计、海报、PPT、Logo

| 仓库 | 会话数（约） | Skill | 落地 |
| --- | ---: | --- | --- |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 8 | `impeccable` | 海报 / 演示 / 视频 |
| [minimax-ai/skills](https://github.com/minimax-ai/skills) | 7 | `pptx-generator` | `presentation-production` |
| [dacnay816y62-hub/regional-culture-poster](https://github.com/dacnay816y62-hub/regional-culture-poster) | 5 | `regional-culture-poster` | `poster-production` |
| [yunyiliu/cvpr-2026-poster-skill](https://github.com/yunyiliu/cvpr-2026-poster-skill) | 5 | `cvpr-2026-poster` | 同上 |
| [joeseesun/qiaomu-mondo-poster-design](https://github.com/joeseesun/qiaomu-mondo-poster-design) | 5 | `qiaomu-mondo-poster-design` | 同上 |
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | 3 | `magazine-poster` | 无 |
| [arnabbagxd/Brand-building-skills](https://github.com/arnabbagxd/Brand-building-skills) | 4 | `brand-identity` | `brand-logo-production` |
| [meodai/skill.color-expert](https://github.com/meodai/skill.color-expert) | 4 | `color-expert` | 同上 |
| [op7418/logo-generator-skill](https://github.com/op7418/logo-generator-skill) | 4 | `logo-generator` | 同上 |
| [seb1n/awesome-ai-agent-skills](https://github.com/seb1n/awesome-ai-agent-skills) | 4 | `logo-design` | 同上 |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 28 | `ui-ux-pro-max` | 无 |
| [oliwoodman/fable-skills](https://github.com/oliwoodman/fable-skills) | 7 | 叙事 / 设计检索 | 无 |
| [erichowens/some_claude_skills](https://github.com/erichowens/some_claude_skills) | 2 | `typography-expert`, `collage-layout-expert` | 无 |

### 4.5 视频与运动设计

| 仓库 | 会话数（约） | 落地 |
| --- | ---: | --- |
| [iart-ai/motion-design-skills](https://github.com/iart-ai/motion-design-skills) | 5 | 已声明并 vendor：动画原则、卡点、构图等 |
| [iart-ai/tiktok-video-skills](https://github.com/iart-ai/tiktok-video-skills) | 5 | 已声明并 vendor |
| [iart-ai/explainer-video-skills](https://github.com/iart-ai/explainer-video-skills) | 5 | 已声明并 vendor |
| [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) | 1 | 用户点名；未按此仓声明 |
| [Agentchengfeng/chengfeng-videocut-skills](https://github.com/Agentchengfeng/chengfeng-videocut-skills) | 5 | 已声明并 vendor |
| [cclank/lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) | 5 | 已声明并 vendor |
| [memex-lab/product-launch-video-skill](https://github.com/memex-lab/product-launch-video-skill) | 5 | 已声明并 vendor |
| [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | 1 | 无 |
| [Pluviobyte/video-production-skills](https://github.com/Pluviobyte/video-production-skills) | 1 | 无 |
| [alchaincyf/huashu-skills](https://github.com/alchaincyf/huashu-skills) | 2 | 无 |
| [op7418/Video-Wrapper-Skills](https://github.com/op7418/Video-Wrapper-Skills) | 1 | 无 |
| [zhaihao118/Micro-Drama-Skills](https://github.com/zhaihao118/Micro-Drama-Skills) | 1 | 无 |
| [GanymedeNil/poxiaoxing-skills](https://github.com/GanymedeNil/poxiaoxing-skills) | 1 | 无 |

### 4.6 音乐

| 仓库 | 会话数（约） | 落地 |
| --- | ---: | --- |
| [jwynia/agent-skills](https://github.com/jwynia/agent-skills) | 6 | `musical-dna` 已声明并 vendor |
| [SJY051/music-composition](https://github.com/SJY051/music-composition) | 5 | 已声明并 vendor |
| [all666666all/miaoxiang-music.skill](https://github.com/all666666all/miaoxiang-music.skill) | 5 | 已声明并 vendor |
| [damionrashford/media-os](https://github.com/damionrashford/media-os) | 5 | 已声明并 vendor |

### 4.7 研究与数据源

| 仓库 | 会话数（约） | 落地 |
| --- | ---: | --- |
| [firecrawl/cli](https://github.com/firecrawl/cli) | 35 | 历史参考；未作为运行时依赖发布 |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | 13 | `arxiv-search` 已声明并 vendor |
| [scrapegraphai/just-scrape](https://github.com/scrapegraphai/just-scrape) | 1 | 无 |
| [tavily-ai/skills](https://github.com/tavily-ai/skills) | 1 | 无 |

### 4.8 语言 / 岗位工程（后期会话与当前工作树）

这些主要出现在岗位插件拆分之后，多数已写入对应 `skill-deps.json`，`vendor-skills/index.json` 里还没有。

| 仓库 | 会话数（约） | 声明插件 |
| --- | ---: | --- |
| [android/skills](https://github.com/android/skills) | 2 | `android-engineering` |
| [hamen/compose_skill](https://github.com/hamen/compose_skill) | 2 | `android-engineering` |
| [twostraws/SwiftUI-Agent-Skill](https://github.com/twostraws/SwiftUI-Agent-Skill) | 2 | `ios-engineering` |
| [twostraws/Swift-Concurrency-Agent-Skill](https://github.com/twostraws/Swift-Concurrency-Agent-Skill) | 2 | `ios-engineering` |
| [twostraws/Swift-Testing-Agent-Skill](https://github.com/twostraws/Swift-Testing-Agent-Skill) | 2 | `ios-engineering` |
| [vuejs-ai/skills](https://github.com/vuejs-ai/skills) | 2 | `web-frontend-engineering` |
| [angular/skills](https://github.com/angular/skills) | 2 | `web-frontend-engineering` |
| [callstackincubator/agent-skills](https://github.com/callstackincubator/agent-skills) | 2 | `react-native-engineering` |
| [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) | 2 | `rust-engineering` |
| [LukasNiessen/kubernetes-skill](https://github.com/LukasNiessen/kubernetes-skill) | 2 | `kubernetes-operations` |
| [expo/skills](https://github.com/expo/skills) | 3 | 未声明（检索对照） |
| [charleswiltgen/axiom](https://github.com/charleswiltgen/axiom) | 1 | 未声明（SwiftUI 调试对照） |

### 4.9 工作报告

| 仓库 | Skill | 落地 |
| --- | --- | --- |
| [affaan-m/ecc](https://github.com/affaan-m/ecc) | `growth-log` | `work-reporting`（已 vendor） |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | `brag-sheet`, `performance-review-writer` | 同上 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `grilling` | 同上 |

## 5. 会话里出现、当前未写入 skill-deps 的高信号候选

只列用户点过、或至少 5 个会话反复出现、且现在没有对应 `skill-deps` 声明的条目。

| 名称 | 来源 | 为何还值得单独记 |
| --- | --- | --- |
| `find-skills` | [vercel-labs/skills](https://www.skills.sh/vercel-labs/skills/find-skills) | 用户点名“超级多人使用”，Grok/Codex 都做过 hooks 设计，但没有当社区 Skill 依赖声明 |
| `triage` | [mattpocock/skills/triage](https://www.skills.sh/mattpocock/skills/triage) | 工程师思维插件用户点名，未进 `engineering-practice` |
| `dispatching-parallel-agents` | [obra/superpowers](https://www.skills.sh/obra/superpowers/dispatching-parallel-agents) | 用户要求并入 subagent 任务 |
| Superpowers / neolabhq 的 `subagent-driven-development` | 见上 | 用户两次点名；当前仓没有同名外部依赖 |
| `debug` / `debugging-strategies` | Anthropic knowledge-work、wshobson | 调试插件用户对照清单里的另外两家 |
| `pptx`（Anthropic） | [anthropics/skills/pptx](https://www.skills.sh/anthropics/skills/pptx) | PPT 会话用户点名评估 |
| `magazine-poster` | [nexu-io/open-design](https://www.skills.sh/nexu-io/open-design/magazine-poster) | 海报会话用户点名 |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 设计检索最频繁的未采用仓之一 |
| OpenMontage / 话术 / 视频包装 / 微短剧 / 破晓星 | 见 4.5 | 用户视频增强清单里未落地的一半 |
| `iart-ai/motion-skills` | 用户点的仓名 | 落地时改用了同作者另外三个仓 |

长尾（skills.sh 搜索结果、一次工具抓取）还有约 150 个仓，例如 `theneoai/awesome-skills`、`alirezarezvani/claude-skills`、`kodrunhq/opencode-autopilot`。它们几乎都只有 1 个会话、且角色是 tool，不在这里展开。

## 6. 不是 Skill、但会话里反复参考的外部仓库

| 仓库 / 数据集 | 用途 | 备注 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | 读 hooks、plugins、multi-agent、agent 配置实现 | 约 25 个会话 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | 读 hooks、plugins、sub-agents、官方 plugin-dev | 约 12 个会话 |
| [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS) | PPT 实现对照 | 用户上下文出现 |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) / [remotion-dev/skills](https://github.com/remotion-dev/skills) | 视频 / 程序化影像对照 | 助手检索 |
| [cursor/plugins](https://github.com/cursor/plugins) | `show-me-your-work` 等对照 | Grok 工具结果 |
| [princeton-nlp/SWE-bench_Lite](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite) | 评测数据集 | 工具下载痕迹很多，不是 Skill |
| [astropy/astropy](https://github.com/astropy/astropy) | SWE-bench 实例仓 | 评测会话，不是 Skill |

官方文档（用户点过或助手高频打开）：

- [ChatGPT / Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code plugins / marketplaces / sub-agents](https://code.claude.com/docs/en/plugins)
- [Codex plugins / multi-agent / skills](https://developers.openai.com/codex/plugins)
- 微信文章 [https://mp.weixin.qq.com/s/Z3t7wA3OEHskHOmc9LtgnA](https://mp.weixin.qq.com/s/Z3t7wA3OEHskHOmc9LtgnA)（用户要求结合插件实现一起看）

## 7. 内部兄弟仓库（不是外部公开 Skill，但会话里当“外部参考仓”用）

这些路径在 Codex 用户消息里反复出现，密度高于绝大多数 GitHub Skill 仓：

| 路径 | 会话里的用法 |
| --- | --- |
| `/srv/workspaces/work/infra/harness-starter` | hooks 清单、Skill 路由、encoding-guard、subagent hooks、日报实现、还缺哪些插件 |
| `/srv/workspaces/work/infra/ai-experts` | 哪些实现能迁到本仓库插件 |
| `/srv/workspaces/work/harness-start/swe-strict-eval` | 用本仓库插件跑 SWE-bench |
| `/srv/workspaces/work/harness/process-confidence` | 早期 Grok 会话对照 |

它们不是 `skill-deps` 意义上的社区 Skill，但属于“本仓库设计时参考过的外部仓库”。

## 8. 当前已声明来源一览

下面是 2026-08-17 工作树里 `plugins/*/skill-deps.json` 的去重源。标了“已 vendor”的在 `vendor-skills/index.json` 里有对应条目。

| 源仓库 | 声明的 Skill | 插件 | vendor |
| --- | --- | --- | --- |
| github.com/obra/superpowers | brainstorming, systematic-debugging, test-driven-development, verification-before-completion, requesting-code-review, finishing-a-development-branch | 多个工程插件 | 是 |
| github.com/mattpocock/skills | research, handoff, grilling | evidence-based-research, work-reporting | 是 |
| github.com/szkocot/andrej-karpathy-skills | karpathy-guidelines | engineering-practice | 是 |
| github.com/JuliusBrussee/caveman | caveman | professional-writing | 是 |
| github.com/blader/humanizer | humanizer | professional-writing | 是 |
| github.com/hardikpandya/stop-slop | stop-slop | professional-writing | 是 |
| github.com/op7418/Humanizer-zh | humanizer-zh | professional-writing | 是 |
| github.com/MrGeDiao/shuorenhua | shuorenhua | professional-writing | 是 |
| github.com/zc277584121/marketing-skills | remove-ai-style | professional-writing | 是 |
| github.com/pbakaus/impeccable | impeccable | 海报 / 演示 / 视频 | 是 |
| github.com/minimax-ai/skills | pptx-generator | presentation-production | 是 |
| github.com/dacnay816y62-hub/regional-culture-poster | regional-culture-poster | poster-production | 是 |
| github.com/yunyiliu/cvpr-2026-poster-skill | cvpr-2026-poster | poster-production | 是 |
| github.com/joeseesun/qiaomu-mondo-poster-design | qiaomu-mondo-poster-design | poster-production | 是 |
| github.com/arnabbagxd/Brand-building-skills | brand-identity | brand-logo-production | 是 |
| github.com/meodai/skill.color-expert | color-expert | brand-logo-production | 是 |
| github.com/op7418/logo-generator-skill | logo-generator | brand-logo-production | 是 |
| github.com/seb1n/awesome-ai-agent-skills | logo-design | brand-logo-production | 是 |
| github.com/iart-ai/motion-design-skills | animation-principles 等 5 个 | video-production | 是 |
| github.com/iart-ai/tiktok-video-skills | short-form-video, caption-animation | video-production | 是 |
| github.com/iart-ai/explainer-video-skills | explainer-video | video-production | 是 |
| github.com/Agentchengfeng/chengfeng-videocut-skills | chengfeng-cut, chengfeng-subtitle | video-production | 是 |
| github.com/cclank/lanshu-awesome-ai-video-kit | model-selector, prompt-translator, seedance-storyboard | video-production | 是 |
| github.com/memex-lab/product-launch-video-skill | product-launch-video, gemini-tts | video-production | 是 |
| github.com/jwynia/agent-skills | musical-dna | music-production | 是 |
| github.com/SJY051/music-composition | music-composition | music-production | 是 |
| github.com/all666666all/miaoxiang-music.skill | miaoxiang-music | music-production | 是 |
| github.com/damionrashford/media-os | workflow-analysis-quality, workflow-audio-production | music-production | 是 |
| github.com/firecrawl/cli | firecrawl | knowledge-work/research | 否；仅保留历史设计参考 |
| github.com/langchain-ai/deepagents | arxiv-search | evidence-based-research | 是 |
| github.com/addyosmani/agent-skills | spec-driven-development | spec-driven-development | 是 |
| github.com/affaan-m/ecc | growth-log | work-reporting | 是 |
| github.com/github/awesome-copilot | brag-sheet, performance-review-writer, java-junit, java-springboot, javax-to-jakarta-migration | work-reporting, java-engineering | 是 |
| github.com/vercel-labs/agent-skills | vercel-react-best-practices, vercel-composition-patterns | web-frontend-engineering | 是 |
| github.com/vuejs-ai/skills | vue-best-practices 等 | web-frontend-engineering | 是 |
| github.com/angular/skills | angular-developer | web-frontend-engineering | 是 |
| github.com/android/skills | r8-analyzer, testing-setup | android-engineering | 是 |
| github.com/hamen/compose_skill | compose-agent | android-engineering | 是 |
| github.com/twostraws/* | swiftui-pro, swift-concurrency-pro, swift-testing-pro | ios-engineering | 是 |
| github.com/callstackincubator/agent-skills | react-native-best-practices 等 | react-native-engineering | 是 |
| github.com/leonardomso/rust-skills | rust-skills | rust-engineering | 是 |
| github.com/LukasNiessen/kubernetes-skill | kubernetes-skill | kubernetes-operations | 是 |

`go-engineering`、`php-engineering`、`python-engineering`、`nix-engineering` 在工作树里已有插件目录，本轮未发现对应的 `skill-deps.json` 外部源。

## 9. 方法限制

- “用户点名”只统计会话记录里能还原的用户消息。Grok 的部分 `user` 行其实是环境包装，会把助手已检索的 URL 回灌成 user 角色；第 3 节因此以 Codex 原始用户句为准。
- 工具输出里的 skills.sh 搜索结果噪声很大（占位符、API 路径、一次命中的无关仓）。第 4、5 节做了过滤，没有把 161 个搜索命中原样粘进来。
- 插件后来改过名（例如 `engineering-mindset` → `engineering-practice`，`logo-project-delivery-guard` → `brand-logo-production`）。表格用当前目录名。
- 会话次数是“至少出现过的会话数”，不是独立采用决策次数。`mattpocock/skills` 的 69 次包含大量工具回显。
- 没有打开每条会话的完整 transcript 做人工精读；关键用户句来自约 12 条高相关 Codex 会话的原文抽取。
