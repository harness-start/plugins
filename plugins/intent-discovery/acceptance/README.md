# intent-discovery acceptance

## 01-first-turn-context

在合成仓库里要求修改一个文本规范化函数。用例同时要求：

- 双宿主日志包含真实的首轮 Hook prompt；
- agent 找到项目内兼容约束并保留公共 export；
- 修改后的现有测试通过。

## 02-simple-direct

首轮是严格单行输出任务。用例验证 Hook 仍触发，但 `light` 路径不把请求变成访谈或额外说明。

```bash
# cwd: marketplace 仓库根目录；从宿主自动进入 Docker
./scripts/acceptance/run.sh --plugin intent-discovery
```
