# language-output-governance

`language-output-governance` 让 Claude Code 和 Codex 在一次会话里用同一个自然语言 profile。它取代旧的 `in-chinese`。安装器默认按系统 locale 选 profile；宿主和项目都没配时，仍用简体中文。

插件只治理会话的自然语言输出语言，不控制语气、人格、详略、格式、翻译质量或工具输出。

`SessionStart` 的 profile 提示覆盖 agent 编写的所有自然语言值，包括 JSON、YAML、TOML、XML、Markdown machine block、表格和生成文件里的说明性字段。schema、key、枚举、ID、标识符、代码、命令、路径、原文引用和明确要求的翻译内容不随之改写；把自然语言放进结构化数据或 code fence 不会自动获得豁免。

## 语言 Profile

| Profile | 允许的自然语言文字系统 |
| --- | --- |
| `zh-CN` | Han |
| `zh-TW` | Han；提示词要求繁体中文 |
| `en-US` | Latin 技术文本与散文；检查 Han、Hangul、Kana 和 Thai |
| `ja-JP` | Han 和 Kana |
| `ko-KR` | Hangul |
| `th-TH` | Thai |

Latin 始终允许，避免命令、API、类型、标识符和技术术语造成误报。检测器不会尝试区分同样使用 Han 字符的中文和日文。

## 生命周期与状态

- `SessionStart` 加载默认配置并注入活动 profile 标记；startup/clear 会话重置，resume/compact 会话保留状态。
- `UserPromptSubmit` 记录明确的回复语言请求。普通会话语言请求可替换首选 profile；翻译请求只授权目标语言，不改变首选 profile。
- `PostToolUse` 只检查模型为 Bash、Write、Edit、MultiEdit 和 apply_patch 生成的工具输入。带引号的 shell payload 会作为独立候选片段检查，避免命令语法稀释自然语言比例。命令和工具输出从不扫描，每个会话最多报告一次。
- `Stop` 和 `SubagentStop` 在最终散文含未授权文字系统时要求完整重写；宿主带 `stop_hook_active` 的重试仍会阻断，直到散文不再漂移。

状态包含 `preferredProfile`、有限的 `authorizedProfiles` 集合和 `toolFeedbackDelivered`。主 agent 与 subagent 共享父会话的 session ID。状态不保存 prompt、回复、命令或文件内容；它以 session ID 的 SHA-256 为键，原子写到当前工作目录的 `.language-output-governance/state/`。`.language-output-governance/.gitignore` 只忽略 `state/`，插件不会修改项目根目录的 `.gitignore`。状态 24 小时后过期，当前没有逐轮 profile 或撤销协议。

Claude 和标准 Codex provider 通过 `hookSpecificOutput.additionalContext` 接收 `PostToolUse` 反馈。Codex 0.146 配合本仓库 DeepSeek 验收 provider 时，模型可见的 `PostToolUse` 反馈会丢失原始工具结果；只有同时存在 `PLUGIN_ROOT` 与 `DEEPSEEK_MODEL` 时才启用兼容分支，抑制该提示且不占用反馈标记，仍由 `Stop` 负责纠正。其他运行时继续使用正常软反馈。

## 配置优先级

配置优先级为：Git 根目录 `.language-output-governance.mjs` → 宿主级安装偏好 → 严格默认值。

安装器可持久化宿主级偏好：

```bash
bash scripts/install-all.sh --language en-US
```

未传 `--language` 且未设置 `HARNESS_LANGUAGE_PROFILE` 时，安装器按 `LC_ALL`、`LC_MESSAGES`、`LANG` 的顺序读取系统 locale。简体中文、繁体中文、英文、日文、韩文和泰文 locale 分别映射到对应内置 profile；未知 locale 会告警并使用 `en-US`。`C` 和 `POSIX` 也使用 `en-US`。显式参数或环境变量始终优先。

Claude Code 从 `CLAUDE_CONFIG_DIR`（默认 `~/.claude`）下的 `harness-start/language-output-governance.json` 读取；Codex 从 `CODEX_HOME`（默认 `~/.codex`）下的同一相对路径读取。JSON 只包含 `defaultProfile`。

项目覆盖配置示例：

```js
export default {
  defaultProfile: "zh-CN",
  toolFeedback: "report", // report | off
  stop: "block",          // block | off
  detection: {
    minScriptCharacters: 12,
    minLetterRatio: 0.25,
  },
};
```

配置只接受以下字段：`defaultProfile`、`toolFeedback`、`stop`、`detection.minScriptCharacters` 和 `detection.minLetterRatio`。`defaultProfile` 可使用 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 或 `th-TH`。任一未知或非法字段都会使完整项目配置回退严格默认值。字符阈值范围为 `1..100`，字母比例范围为 `0.01..1`。自定义检测回调、任意其他 profile、路径覆盖和读取旧 `in-chinese` 配置均不在契约内。

`.language-output-governance.mjs` 是项目拥有、通过 `import()` 加载的可信可执行配置。可使用内置 `language-output-governance-config` Skill 初始化或诊断。

## 检测边界

检测器会分别检查每一行和完整候选文本。profile 与显式授权形成允许的 Unicode Script 并集；其余 Han、Hangul、Kana 或 Thai 字符达到配置的最小数量和 Unicode 字母比例时才触发，Latin 不受守卫。

Han 还会再做一层字形判断：`zh-CN` 会拦成段繁体专用字，`zh-TW` 会拦成段简体专用字，`ja-JP` 会拦没有假名的成段汉字（当作中文）。两边都授权时不报。一对多异体（后/发/里/台 等）不参与计分，避免误报。

计数前会排除 fenced code、inline code、Markdown 引用行、URL 和链接目标。`PostToolUse` 只提取生成输入，包括命令文本及其带引号 payload、文件内容、替换字符串或 patch 新增行；`Stop` 只检查宿主提供的最终 assistant message。这是确定性的 Unicode Script 守卫，不是通用自然语言分类器。

结构化字段值的语言一致性属于预防性提示契约。Latin 仍始终允许，插件不会把中文 profile 中的英文散文升级为硬阻断；这样可以避免误伤技术术语、API、类型和标识符。

## 从 `in-chinese` 迁移

`language-output-governance@0.2.0` 已取代旧插件身份。`scripts/install-all.sh` 会先移除 marketplace 插件，再安装当前 catalog。手动安装时应卸载 `in-chinese` 并安装 `language-output-governance`；没有兼容别名，也不会读取旧配置。

## 验证

在 marketplace 根目录运行：

```bash
node --test plugins/language-output-governance/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin language-output-governance
```

验收命令需要 Docker，以及仓库验收 runner 所述的 DeepSeek 凭据。
