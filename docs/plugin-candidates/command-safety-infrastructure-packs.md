# 现有插件扩展：`command-safety-guards` infrastructure packs

| 字段 | 裁定 |
| --- | --- |
| 形态 | 扩展 `plugins/command-safety-guards/`，不新增插件 ID |
| 优先级 | P1 |
| 默认安装 | 随现有插件；provider pack 默认关闭 |
| 目标 | 复用现有 tokenizer、配置、deny/report 与升级机制，补持久数据和基础设施命令风险 |

## 为什么不新增 `infra-ops-safety`

原候选的 K8s、PVE、Docker、云 CLI 全部发生在 shell `PreToolUse`，与 `command-safety-guards` 的声明式规则和引擎机制相同。独立插件会复制 shell 分段、wrapper 展开、项目配置、Hook 输出和 deny escalation，还可能让两个插件对同一命令给出冲突决定。

两个源仓提供的规则可以迁移，但必须按 provider 分包，不能把所有基础设施机制塞进一个默认开启的大引擎。

## 建议扩展面

| pack / engine | 默认 | 最小范围 |
| --- | --- | --- |
| `persistentDataLoss` | `report` 后评估是否升为 deny | `docker compose down -v`、`docker volume rm/prune` 等本地持久数据删除 |
| `k8sStateful` | off | StatefulSet 非 orphan 删除；PVC/PV 删除只 report |
| `pveStorage` | off | PVE 磁盘缩容 deny；guest destroy、volume free 只 report |
| `cloudBulkDelete` | off | S3 recursive delete 等明确批量持久对象删除 |
| `productionKubectl` | off | drain、scale 0、remote manifest、强制 replace 等可恢复但高影响操作，只 report |

pack 是配置聚合；每条不可恢复语义仍由独立 engine 或窄 rule 实现。依赖 cwd、kube context、文件证据或多步 preflight 的判断不得降级成单条正则。

```js
// .command-safety-guards.mjs
export default {
  settings: {
    engines: {
      k8sStateful: true,
      pveStorage: false,
      cloudBulkDelete: false,
      productionKubectl: false,
    },
  },
};
```

示例沿用现有 boolean engine 开关；`productionKubectl` 自身只产生 report。实现时不得同时维护 `packs` 与 `engines` 两套开关。

## 因果边界

- 能确定为不可恢复数据删除的命令可 deny；可恢复的停机、回滚和驱逐默认只 report。
- “生产”不能只由 `prod` 字符串决定。没有可信 kube context/namespace 配置时不得将生产专属规则升级为 deny。
- allow 规则是否能覆盖某个 engine 必须在文档中逐项声明；高危 engine 不应被一个宽 regex allow 绕过。
- 不执行集群 inventory、Terraform plan 或远程 preflight；需要实时状态的能力属于相应 Skill/Tool。

## Hook / Skill 分工

- `PreToolUse` 是唯一执行门禁：它复用现有 shell tokenizer、wrapper 展开、engine 配置和 deny/report 升级逻辑，在命令执行前给出确定决定。
- v1 不新增 Skill。provider pack 是被动安全策略，不需要模型先进入某个工作流才能生效。
- 后续如增加 `command-safety-config` Skill，它只能帮助生成配置、解释 finding 和给出恢复命令，不能临时批准命令、关闭高危 engine 或签发 allow receipt。
- 需要实时 inventory 或远端 preflight 时，由领域 Skill 编排相应只读工具；未取得世界状态的规则只能 report，不能借 Skill 的判断升级为 deny。

## 实现准入与验收

- 先给 `command-safety-guards` 增加 engine 注册表与重复策略检查，确保同一语义只有一个 owner；
- 覆盖 env/sudo/ssh/sh -c、管道、连接符、参数换序、quoted commit message 和 heredoc near-miss；
- `kubectl get`、PVE 扩容、精确非数据删除、普通 Docker cleanup 不误拦；
- 每个 opt-in engine 分别有配置启停、deny/report、恢复文本和 deny escalation 测试；
- targeted unit 后运行现有插件全套单测，并在 Docker 中扩充该插件 acceptance，而不是新增 acceptance plugin；
- Hook 未触发的日志必须让新增 expect 失败。

验收还应证明：即使完全不加载任何 Skill，配置已开启的 engine 仍会在 `PreToolUse` 稳定触发；只加载 Skill 而移除 Hook 时 honesty gate 必须失败。

第一阶段只实现 `k8sStateful` 与 `pveStorage` 两个高特异性 engine。宽云删除清单没有足够反例前不进入默认规则。
