# 专业写作

`professional-writing` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量路由提示：仅在匹配的写作场景，通过宿主原生入口加载必要社区 Skill，再开始实质写作。

| 场景 | Skill |
|---|---|
| 用户明确要求更短输出或减少 token | `caveman` |
| 英文内容撰写、改写或审阅 | `humanizer` + `stop-slop` |
| 中文内容撰写、改写或审阅 | `humanizer-zh` + `shuorenhua` + bundled `ai-flavor-remover` |
| 创建或编辑人类可读的 Markdown 正文 | 对应语言组合 + `remove-ai-style` |

中英正文都占实质篇幅时加载两套语言组合；零星外文术语按正文主语言处理。代码、命令、配置、机器输出、逐字引用和精确短回复不加载写作 Skill。事实、数字、URL、标识符、引文和 Markdown 结构必须保留。

英文组合先用 `stop-slop` 找候选问题，再由 `humanizer` 结合上下文判断是否改写。中文组合由 `shuorenhua` 的场景、事实保真和受保护内容规则处理冲突；`ai-flavor-remover` 的大众文章风格只在文体适合时采用。

`remove-ai-style` 需要 Python 3。编辑已有 Markdown 正文时在修改前后各运行一次分析器；新建文档则在初稿后分析，修订后复检。每次执行前必须校验 `scripts/analyze_ai_style.py` 的 SHA-256 与 `skill-deps.json` 中批准的摘要完全一致；缺失或不一致时停止该写作路线。分析结果只是定位证据，不能代替通读或授权批量替换。

## 安装依赖

仓库根目录执行：

```bash
bash scripts/install-all.sh
```

安装器按 `skill-deps.json` 中的精确 Git commit 安装社区 Skill。`ai-flavor-remover` 随插件发布。只通过宿主 marketplace 单独安装插件时，需要另行安装声明的外部 Skill。选中路线的必要 Skill、引用文件、Python 3 或分析器缺失时，内部编排必须停止并报告缺口，不能用当前会话知识模仿缺失能力。

## 边界

SessionStart 只负责写作 Skill 编排，不处理工程实践，也不提供硬门禁。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不承诺绕过 AI 检测器，不创建状态目录。

`caveman` 只改变会话表达方式，不改变代码、命令、路径、错误文本或持久化文档。安全警告、不可逆操作确认和顺序敏感步骤保持完整表达。

## 来源

- `caveman`：MIT；只安装 Skill，不安装其他运行时组件
- `humanizer`：`blader/humanizer`
- `stop-slop`：`hardikpandya/stop-slop`
- `humanizer-zh`：`op7418/Humanizer-zh`
- `shuorenhua`：`MrGeDiao/shuorenhua`
- `remove-ai-style`：`zc277584121/marketing-skills`
- `ai-flavor-remover`：随插件发布的 `wangjiawei508/workwise` 包装，原始 Prompt 来自 `hylarucoder/ai-flavor-remover`

外部 Skill 固定到 `skill-deps.json` 声明的 commit；除随插件发布的包装外，不复制社区 Skill 正文。
