# Acceptance

每个 case 都在全新的 Claude Code 与 Codex 会话中安装 `test-driven-development`。验收同时检查最终文件状态与真实 `[TDD Guard]` Hook 信号。工作区由 runner `git init` 并提交夹具，所以“测过没有”以相对 HEAD 的 git 状态为准。

| Case | 任务 | 极性 |
| --- | --- | --- |
| `01-block-source-first` | 新实现 | 拒绝空仓库直接写实现 |
| `02-allow-test-first` | 新实现 | 写测试 → 观察 RED → 写实现 → GREEN |
| `03-same-name-identity` | 新实现 | RED 之后拒绝错误同名模块，放行正确模块并 GREEN |
| `04-historical-test-first` | 修 bug | 已有对应测试时直接改实现被拒绝 |
| `05-historical-fix-allow` | 修 bug | 已失败的对应测试观察 RED 后允许修实现并 GREEN |
| `06-feature-delete` | 删特性 | 先删对应测试，再删实现，不要求再制造 RED |
| `07-unresolved-verification-scope` | 修 bug 后验证 | 已观察到的全套失败不能被更窄的 GREEN 覆盖；同一 runner 的等价全套命令通过后允许完成 |
| `08-red-implementation-iteration` | 第一次实现仍失败 | 每次实现修改之间运行相关测试；中间 RED 允许继续修正，最终仍须 GREEN |
