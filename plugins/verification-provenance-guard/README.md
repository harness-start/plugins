# verification-provenance-guard

`verification-provenance-guard` 要求 Claude Code 和 Codex 在发生变更，或声称测试、产物、Git、CI 结论时，提供可机器核验的 `verification-evidence/v2` 证据。v2 同时验证过程顺序和最终证据新鲜度。

标签不是证据。`[本地实测]` 必须匹配最后一次变更后的成功命令 receipt 或当前 Git 状态；`[产物实测]` 必须匹配 workspace 内文件的字节数和 SHA-256；`[远端 CI]` 必须匹配本会话捕获的结构化 GitLab/GitHub 结果。

## 默认流程

1. SessionStart 注入 `evidence-driven-delivery` 与 evidence reporting 协议。
2. UserPromptSubmit 推进 prompt epoch；只有当前 epoch 的最终命令可以证明完成。
3. PostToolUse 按 `test/code/non_code/unknown` 记录 mutation，并保存有界命令 receipt。
4. 行为代码必须形成测试编辑 → RED → 生产改动 → 当前 GREEN；重构必须使用同一测试命令形成前后 GREEN。
5. Stop 独立解析并核验 v2；预期证据错误不会因重试次数而 fail-open。
6. `done`/`done_with_concerns` 放行后清空状态；`blocked`/`needs_context` 保留状态供后续恢复。

普通问答不会被要求输出 manifest。完整流程见 [delivery Skill](./skills/evidence-driven-delivery/SKILL.md)，格式见 [reporting Skill](./skills/verification-evidence-reporting/SKILL.md)，运行时边界见 [DESIGN.md](./DESIGN.md)。

## 社区 TDD Skill

插件通过 [`skill-deps.json`](./skill-deps.json) 安装 `mattpocock/skills` 的 `tdd` Skill，为 public seam、纵向切片和 RED/GREEN 提供方法指导。硬校验规则全部位于插件本地；跳过 community skill 安装不会关闭 Stop 门禁。

## 项目配置

在 Git 根目录创建 `.verification-provenance-guard.mjs`：

```js
export default {
  mode: "block", // block | report | off
  trigger: "mutation-or-claim", // mutation-or-claim | claim-only | always
  artifact: { maxBytes: 64 * 1024 * 1024 },
  stop: { maxBlocks: 2 },
  claims: {
    additionalPatterns: [/数据库迁移已验证/u],
  },
  commands: {
    testPatterns: [/\bmy-test-runner\b/u],
    verificationPatterns: [/\bmy-static-check\b/u],
    expectedFailurePatterns: [/expected mismatch/iu],
  },
  paths: {
    testPatterns: [/\/contract-tests\//u],
    codePatterns: [/\/runtime\//u],
    nonCodePatterns: [/\/generated-reports\//u],
  },
};
```

`stop.maxBlocks` 只控制何时切换为精简恢复提示，不会放行无效完成态。配置文件是项目拥有、通过 `import()` 加载的可信可执行配置。无效字段使用有界默认值并告警；配置加载失败时保留默认守卫。

项目所有者可用 `mode: "report"` 进行迁移观察，或用 `mode: "off"` 明确关闭。用户需要放弃无法恢复的活动证据链时，必须独立提交：

```text
# verification-abort
```

模型在回复中书写该文本不会授权绕过。

## 验证

```bash
node --test plugins/verification-provenance-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin verification-provenance-guard
```

Version: `0.2.0`
