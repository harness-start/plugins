# interface-design

`interface-design` 改进 Web 与应用界面的视觉工艺，而不把工作流绑到 React、Vue、Flutter 或其他框架。它组合编排 Skill、只读批判 Skill、机械工艺地板，以及跨编辑保持视觉连续性的生命周期反馈。

## 用途

界面工作常常通过功能测试，却在层级、间距、字体、对比、响应式行为、动效或设计系统连续性上失败。本插件给 agent 一份聚焦的 UI 设计合同，并抓住可识别的视觉反模式，而不把主观设计判断伪装成确定性分数。

## 设计

`craft` 域位于 `src/domains/`，共享 owner 的单一 Hook、Skill、测试、验收、license 和构建边界。`interface-craft` Skill 拥有开放的方向与修复。`interface-visual-critique` 提供只读评审。`interface-craft-floor` 描述编辑 UI 前应立即应用的机械约束。Hook 观察会话上下文和已改的界面文件，然后返回有界反馈或完成发现。

插件对 Claude Code 与 Codex 自包含。安装即启用全部表面；没有能力 profile、框架档位或跨 owner Skill 依赖。

## 能力

| 能力 | 公开 Skill 或机制 | 覆盖内容 |
| --- | --- | --- |
| UI 方向与修复 | `interface-craft` | 层级、字体、间距、对比、设计系统连续性、响应式行为，以及克制的动效 |
| 只读视觉评审 | `interface-visual-critique` | 基于证据的批判，没有编辑或发布权 |
| 机械工艺地板 | `interface-craft-floor` | 可检测的反模式，例如任意硬阴影、弱状态处理和损坏的响应式假设 |
| 会话连续性 | Session/Stop Hook | 在连贯的界面任务中携带选定的视觉方向，并报告未解决的机械发现 |
| 已改文件反馈 | PostToolUse Hook | 只评审相关、已观察到的界面写入，而不是扫描仓库里每种语言文件 |

## 适用场景

设计新页面或应用表面、修复视觉偏弱的 UI、建立或扩展设计系统、评审响应式布局、改进与无障碍相关的视觉层级，或检查动效和交互状态是否贴合现有产品语言时使用。底层框架不同时，仍适用于 Web 与应用界面。

## 不适用场景

不要把它用于海报、logo、演示文稿、图表、印刷品或视频；那些属于 `artifact-production`。不要用它替代功能前端工程、组件测试、浏览器性能分析或正式无障碍审计。只读批判请求不得转成实现任务。

## 运行时行为

`SessionStart` 为相关 UI 工作提供有界工艺上下文。`PostToolUse` 检查宿主观察到的界面变更并报告机械发现。`Stop` 可以为活动界面任务浮出未解决的工艺地板问题。Hook 不要求用户或 agent 提到 Skill 名；Skill 激活本身从不确立视觉质量。

该域刻意把可机械检测的问题与视觉判断分开。Hook 能识别已知模式和已改路径；agent 仍必须检查渲染后的界面、理解产品上下文并做设计取舍。

## 公开接口

公开接口是 `interface-craft`、`interface-visual-critique` 和 `interface-craft-floor` Skill，以及 Claude Code 与 Codex Hook。本 owner 没有公开 CLI，也没有 MCP 服务器。框架特定的实现知识可由宿主或项目提供，但不是本已发布插件的运行时依赖。

## 配置与状态

插件主要依赖仓库上下文和观察到的界面文件，而不是能力选择配置。任何连续性状态都以当前项目/会话为范围，只为把连贯的设计任务连到各生命周期事件。它不创建全局设计档位，也不导入隐藏的工作区 Skill。

## 边界

插件不渲染浏览器、不自行检查像素，也不证明页面好看、无障碍、响应式或可上线。机械检查是辅助证据。结果核验应包括实际渲染状态、目标视口尺寸、交互行为和产品要求。只读评审 Skill 从不获得写入权。

## 验证

```bash
node --import tsx --test \
  plugins/interface-design/tests/*.test.ts \
  plugins/interface-design/tests/domains/craft/*.test.ts
npm run check:dist
```

实时双宿主验收必须在 Docker 下用 `./scripts/acceptance/run.sh --plugin interface-design` 运行。
