# skill-routing-transparency acceptance

## Host case

| Case | Intent | Expected signal |
| --- | --- | --- |
| `01-visible-route-disclosure` | 新主任务收到透明度协议 | Claude 与 Codex 日志出现真实 Hook 协议或 `📌 Skill 路由` 公开行，工作区保持不变 |

宿主验收环境只安装本 Marketplace 插件，不保证安装 Harness runtime。因此 route lookup 缺失时，公开 `unavailable` 是合规结果；不得伪装成 `noMatch`。

## Offline fixture

```bash
bash plugins/skill-routing-transparency/acceptance/cases/01-visible-route-disclosure/run-fixture.sh
```

fixture 直接驱动发布入口，验证双平台 `SessionStart`、任务轮次提醒和短跟进静默。
