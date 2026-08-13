# work-report-insights acceptance

这些 case 同时声明 Claude 与 Codex，覆盖受保护报告写入拒绝和普通请求 no-op。路由与口头确认不再走 hook。`expect.sh` 必须看到真实 host/hook surface；只有 prompt 文本的 inert log 会 fail closed。
