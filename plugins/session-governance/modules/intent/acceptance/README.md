# intent-discovery acceptance

## 01-first-turn-context

在合成仓库里要求修改一个文本规范化函数。用例同时要求：

- 双宿主日志包含真实的首轮 Hook prompt；
- agent 找到项目内兼容约束并保留公共 export；
- 修改后的现有测试通过。

## 02-simple-direct

首轮是严格单行输出任务。用例验证 Hook 仍触发，但 `light` 路径不把请求变成访谈或额外说明。

## 03-new-task-boundary

Claude Code 与 Codex 在同一持久会话收到第二个、实质不同的交付任务。验收要求第二轮生成保持全部仓库要求的交付清单，同时首轮 Hook receipt 仍只有一个。这个 case 证明多轮结果和 Hook 边界；宿主是否按描述再次路由 Skill 不是硬保证，也不以 Skill load 充当结果证据。

```bash
# cwd: marketplace 仓库根目录；从宿主自动进入 Docker
./scripts/acceptance/run.sh --plugin intent-discovery
```
