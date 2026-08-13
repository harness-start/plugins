# Acceptance

每个 case 都在全新的 Claude Code 与 Codex 会话中安装 `tdd-guard`。验收同时检查最终文件状态与真实 `[TDD Guard]` Hook 信号，覆盖实现先行拒绝、测试先行放行、同名类必须按 FQCN 消歧，以及已有对应测试时必须先改那些测试。
