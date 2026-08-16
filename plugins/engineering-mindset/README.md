# 工程师思维

`engineering-mindset` 在 Claude Code 和 Codex 的 `SessionStart` 注入一段轻量路由提示，要求 agent 在匹配的工程或内容场景先通过宿主原生入口加载必要 Skill，再开始实质工作。

| 场景 | Skill |
|---|---|
| 非简单的代码实现、审查或重构 | `karpathy-guidelines` |
| bug、测试或构建失败、性能退化、异常行为 | `systematic-debugging`，确认根因后再按 `karpathy-guidelines` 实施 |
| 准备声明完成、修复或通过 | `verification-before-completion` |
| 用户明确要求更短输出或减少 token | `caveman` |
| 英文内容撰写、改写或审阅 | `humanizer` + `stop-slop` |
| 中文内容撰写、改写或审阅 | `humanizer-zh` + `shuorenhua` + `ai-flavor-remover` |
| 创建或编辑 Markdown 正文 | 对应语言组合 + `remove-ai-style` |

中英正文都占实质篇幅时加载两套语言组合；零星外文术语按正文主语言处理。代码、命令、配置、机器可读输出、逐字引用和精确短回复不加载写作 Skill。用户指令、项目指令、安全规则和平台规则优先。

英文组合先用 `stop-slop` 找候选问题，再由 `humanizer` 结合上下文判断是否改写，避免把单个词或标点当作机械禁令。中文组合由 `shuorenhua` 的场景、事实保真和受保护内容规则处理冲突；`ai-flavor-remover` 的大众文章风格只在文体适合时采用。

`remove-ai-style` 需要 Python 3。编辑已有 Markdown 正文时在修改前后各运行一次分析器；新建文档则在初稿后分析，修订后复检。分析结果只是定位证据，不能代替通读，也不能据此批量替换。

## 安装依赖

仓库根目录执行：

```bash
bash scripts/install-all.sh
```

该脚本读取本插件的 `skill-deps.json`，把固定版本的社区 Skill 安装到 Claude Code 与 Codex 可见的全局 Skill 目录。`ai-flavor-remover` 是随插件发布的 WorkWise 包装，不需要额外安装。只通过宿主 marketplace 单独安装插件时，宿主不会执行仓库的依赖安装脚本，需要另行安装 `skill-deps.json` 中列出的 Skill。依赖、引用文件、Python 3 或分析器缺失时，Hook 要求 agent 明确报告，不能声称已经加载或运行。

## 边界

这是 advisory 提示，不是硬门禁。它能证明 SessionStart 上下文被注入，并可通过 live acceptance 检查依赖安装、路由合同和代表性任务结果；实际 Skill 加载和分析器调用保留为可观测证据，不作为纯提示机制能够稳定强制的效果。它不保证每个模型、每个任务都获得更高工程或写作质量，也不承诺绕过 AI 检测器，不创建状态目录或阻断工具调用。

`caveman` 只改变会话表达方式，不改变代码、命令、路径、错误文本或持久化文档。安全警告、不可逆操作确认和顺序敏感步骤保持完整表达。

v1 不包含 issue/PR `triage` 工作流。

## 来源

- `karpathy-guidelines`：MIT
- `caveman` Skill：MIT；这里只安装 Skill，不安装 Caveman 的其他运行时组件
- `systematic-debugging`、`verification-before-completion`：MIT
- `humanizer`：`blader/humanizer`
- `stop-slop`：`hardikpandya/stop-slop`
- `humanizer-zh`：`op7418/Humanizer-zh`
- `shuorenhua`：`MrGeDiao/shuorenhua`
- `remove-ai-style`：`zc277584121/marketing-skills`
- `ai-flavor-remover`：随插件发布的 `wangjiawei508/workwise` 包装，原始 Prompt 来自 `hylarucoder/ai-flavor-remover`

除已注明的 WorkWise 包装外，外部 Skill 通过 `skill-deps.json` 从固定 Git 提交安装，不复制正文。
