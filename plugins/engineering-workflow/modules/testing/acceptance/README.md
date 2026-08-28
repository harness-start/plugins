# Acceptance

每个 case 都在全新的 Claude Code 与 Codex 会话中安装 `test-driven-development`。验收同时检查最终文件状态与真实 `[TDD Guard]` Hook 信号。工作区由 runner `git init` 并提交夹具；Hook 只检查测试是否先进入当前 Git 变更，不解析测试命令。

| Case | 任务 | 极性 |
| --- | --- | --- |
| `01-block-source-first` | 新实现 | 拒绝空仓库直接写实现 |
| `02-allow-test-first` | 新实现 | 先写对应测试，再写实现 |
| `03-same-name-identity` | 新实现 | 拒绝错误同名模块，放行正确模块 |
| `04-historical-test-first` | 修 bug | 已有对应测试时直接改实现被拒绝 |
| `05-historical-fix-allow` | 修 bug | 先修改已有对应测试，再修实现 |
| `06-feature-delete` | 删特性 | 先删对应测试，再删实现 |
| `07-unresolved-verification-scope` | 无关测试失败 | 无关失败不产生状态或 Stop 阻断 |
| `08-red-implementation-iteration` | 多次实现修正 | 一次测试修改允许连续修正实现 |
