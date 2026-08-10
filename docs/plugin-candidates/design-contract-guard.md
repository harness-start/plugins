# 候选插件：`design-contract-guard`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/design-contract-guard/` |
| 优先级 | P2 |
| 默认安装 | 可选；没有可解析 `DESIGN.md` 时 idle |
| 目标 | 阻止视觉源码新增与 DESIGN.md 明确 token 合同冲突的高置信漂移 |

## 收窄裁定

源仓的 `design-contract-drift-guard` 会比较编辑前后的 findings，只阻断净新增、高置信、合同型问题；这条链路可以自包含移植。原候选还要求 a11y plan/evidence receipt，但“存在计划”或“工具被调用”本身不能证明最终 artifact 满足 WCAG，因此 v1 删除 completion gate 和 a11y 完成声明。

## 最小产品合同

- 解析最近祖先目录中的 `DESIGN.md`，v1 只支持有明确语法的 color 与 spacing token；无法解析时 report 一次并 fail-open。
- 只检查前端视觉源码和样式文件，跳过 token/theme 定义源、生成物、依赖与二进制。
- `PreToolUse` 在可确定的视觉文件写入前记录目标文件、合同摘要和 baseline findings；`PostToolUse` 读取 final bytes，扫描硬编码 color、off-scale spacing 和明确禁用 token，只把净新增、`severity=blocker`、`confidence=high`、`basis=contract` 的 finding 写入可信状态。
- `Stop` 重新读取合同、token owner 和受影响文件；仍存在的新 blocker 才拒绝成功态，历史债务、已修复 finding 或过期 baseline 不得阻断。
- 诊断包含相对文件、精确行号、rule、观察值、对应合同项和恢复方式；不输出“看起来不好看”一类主观判断。
- 若项目要改变合同，先更新 DESIGN.md 与 token 定义，再更新消费代码；Hook 状态绑定两者摘要，避免只改文档绕过已有消费漂移。

```text
存在可解析 DESIGN.md
  → PreToolUse 记录 baseline 与合同摘要
  → PostToolUse 扫描 final bytes 并计算净新增 blocker
  → Stop 复核当前合同、token owner 与目标文件
  → 有 blocker 则要求改用 token，或先修改合同与 token owner
  → 无合同、非视觉文件、只有历史债务时不阻断
```

## Hook / Skill 分工

- Hooks 拥有路径识别、baseline/final 对比、finding 生命周期和 completion 阻断；扫描器是确定性库，由 Hooks 直接调用。
- 可选 `design-contract` Skill 只作为初始化与迁移入口：帮助建立 DESIGN.md grammar、定位 token owner、编排批量修复和解释 finding。
- Skill 不得把主观设计判断写成 blocker，也不能以“已评审”“已修复”的模型声明清理 finding；只有文件重新扫描后的结果能清理状态。

## 非目标

- 不评价审美、不重建完整设计系统、不自动运行浏览器或 axe。
- 不声称 color token 一致就等于对比度、键盘、语义结构或辅助技术验收通过。
- 不与 logo/poster/pptx 等 artifact delivery guard 合并；那些插件拥有各自产物工程和 release receipt。

## 实现准入与验收

- 冻结 DESIGN.md 最小 grammar、支持扩展名和 token source 识别规则；
- 历史 hardcode 保持不变时不报，新增同值时只报新增位置；改用合同 token 后恢复；
- 注释、字符串文案、SVG data URL、测试 fixture、CSS custom property 定义和近似值有 adversarial near-miss；
- DESIGN.md 缺失、损坏、过大、symlink escape 时按合同 fail-open/report，不扫描全仓；
- Docker 两宿主真实编辑一次违规值并修复，expect 同时检查最终文件和 Hook 信号；
- 在实现 outcome-level a11y checker 前，不增加 `design-accessibility-completion-gate`。

移除或绕过 Skill 后，编辑检测与 Stop 闭环仍必须完整工作；移除 Hook 后，即使 Skill 输出合规建议，honesty gate 也必须失败。

如果 parser 不能把 finding 指回明确合同项，规则只能 report，不能 deny。
