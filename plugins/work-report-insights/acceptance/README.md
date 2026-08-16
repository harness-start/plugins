# work-report-insights acceptance

这些 case 同时声明 Claude 与 Codex，覆盖明确报告意图进入统一编排、受保护报告写入拒绝和普通请求 no-op。精确 acknowledgement、digest 失效、failure 恢复与 Stop 递归守卫由 public hook 测试覆盖；单轮 live acceptance 不伪造第二次员工回复。`expect.sh` 必须看到真实 host/hook surface；只有 prompt 文本的 inert log 会 fail closed。
