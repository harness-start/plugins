# Git State Evidence Guard

`git-state-evidence-guard` 在完成时按需校验最终回复中的一个 `git-state-evidence/v1` 代码块与当前仓库状态是否一致。它比较精确 commit、附着分支或 detached 状态，并检查 staged、unstaged 和 untracked 变更是否存在。

没有证据块时插件完全无操作。格式错误、存在多个证据块、内容过大、超时、非 Git 仓库、状态不可读或观察期间发生变化时，只向 stderr 输出诊断并 fail-open。只有结构正确，且两次观察到的当前状态确定性地与一个或多个声明字段冲突时，才会阻断 `Stop`。

```git-state-evidence
{"schema":"git-state-evidence/v1","head":"<40 or 64 lowercase hex characters>","branch":"master","clean":false}
```

声明包含精确的小写 `HEAD`、分支名或 detached HEAD 对应的 `null`，以及覆盖 staged、unstaged 和 untracked 状态的 `clean` 布尔值。修正或删除冲突证据块即可立即恢复，插件不保存会话状态。

## 因果边界

Hook 在 `Stop` 时直接读取 Git，不维护修改历史或 session ledger，也不检查命令和自然语言声明。它只能建立一次有限的本地 Git 状态观察，不能证明 commit 已推送、经过评审或测试、被 CI 接受或已经合并。

## 验证

在 marketplace 根目录运行离线测试：

```bash
node --test plugins/git-state-evidence-guard/tests/*.test.mjs
```
