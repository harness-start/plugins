# 现有插件扩展：`evidence-based-research` content-audit profile

| 字段 | 裁定 |
| --- | --- |
| 形态 | 扩展 `plugins/evidence-based-research/`，不新增插件 ID |
| 优先级 | P2；先恢复现有插件双宿主基线 |
| 默认安装 | 随现有插件；只有显式创建 `content-audit` run 才激活 |
| 目标 | 对给定文章、网页或字幕生成可复验的主张矩阵，同时复用现有 evidence capture 与 seal |

## 为什么不新增 `content-credibility-gate`

`harness-starter` 的 `content-credibility-audit` 提供 claim 抽取、判定、确定性 renderer、validator 与 completion gate；当前 `ai-experts` 没有对应组件，不能作为实现交叉验证。但本仓 `evidence-based-research` 已经拥有 source capture、anchor、typed claim、snapshot、seal 与 handoff。再建一套 `.content-credibility` evidence 栈会重复抓取、摘要和 provenance，并允许同一来源出现两套不兼容结论。

因此只新增 run profile 和 schema，不新增插件、MCP server 或独立 seal 格式。

## 建议扩展面

- `research_begin` 增加显式 `profile: "content-audit"`；普通 research run 行为不变。
- run 记录输入 snapshot digest、原子 claim、原文 anchor、`load_bearing`、verification standard、支持/反证 source IDs、origin、利益关系、覆盖缺口和受限 verdict 枚举。
- renderer 从 canonical run JSON 确定性生成 Markdown 主张矩阵；禁止手改报告后继续沿用旧 seal。
- validator 检查 claim ID 唯一性、anchor 闭包、证据 snapshot hash、支持与反证区分、未核查状态、renderer digest 和输入 freshness。
- 现有 research seal 绑定 profile schema 与 rendered report；`Stop` 继续使用当前 workflow phase 与 seal receipt，不新增自然语言完成正则。

```text
显式 content-audit run
  → Skill 编排 research_begin，确定性工具建立可信 run
  → 复用 source capture/read/anchor 固定输入与证据
  → claim matrix 只引用已捕获 source/anchor
  → deterministic render + validate
  → 现有 seal 绑定 run、report 与 profile schema，Stop 复核 closure
```

这条链路证明来源、主张、判定状态和报告彼此闭合，不证明开放世界中的事实绝对为真。`searched_unverifiable`、`source_unreachable`、`not_checked` 和冲突证据必须保留，不能为了 seal 全绿而降级或删除。

## Hook / Skill 分工

- 现有 MCP tools 拥有 run 激活、source snapshot、anchor、canonical claim、render、validate 和 seal；`Stop` Hook 拥有完成闭环。
- content-audit Skill 只负责显式选择 profile、询问 verification standard、编排工具顺序、展示覆盖缺口和组织补证。
- Skill 生成的 Markdown、引用或 verdict 不直接进入可信状态；必须通过 MCP schema 写入 canonical run，并由 validator/seal 复核。
- 普通 research run 和未激活 content-audit 的会话不因 Skill 可用而被 arm。

## 实现顺序与验收

现有 `evidence-based-research` 在 `docs/acceptance-matrix.md` 中仍标记 Codex MCP tools 暴露问题。该问题未修复且 Claude/Codex 定向基线未重新变绿前，不开始本扩展。

基线恢复后至少覆盖：

- 普通 research profile 的 schema、工具和 Stop 行为零变化；
- content-audit 输入变更、anchor 失效、证据摘要变化、手改 report 后旧 seal 失效；
- 一条 claim 同时有 supporting 与 counter evidence，renderer 不得吞掉反证；
- 未核查/不可达 claim 可被诚实 seal，但不能渲染为 verified；
- Docker 两宿主完成 capture → claim matrix → render → validate → seal，honesty gate 在缺任一真实 Hook/MCP 信号时失败。

增加对抗场景：Skill 输出完整主张矩阵但没有 canonical run/seal 时，`Stop` 必须拒绝 content-audit 成功态；不用 Skill 而直接通过 MCP 完成合法 run 时应允许。

若扩展要求复制第二套 source store 或第二个 MCP server，应停止并重新评估边界。
