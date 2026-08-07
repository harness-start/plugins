# git-delivery-guards

`git-delivery-guards` 在 Claude Code 和 Codex 中统一保护本地 Git 交付：阻止宽范围暂存、破坏性命令、无效分支名、模糊提交信息、跨边界提交和批量冲突选择，并报告 partial staging、大提交与安全清理的陈旧 Git 锁。

插件还在文件工具写入后读取最终文件，阻断仍含标准合并冲突标记的文本文件。GitHub、GitLab、CI、SVN 和远端交付闭环不属于本插件。

## 默认行为

命令规则默认严格启用。普通解析错误 fail-open；明确命中规则时返回可恢复的阻断契约。`index.lock` 只有在超过五分钟、记录了有效 PID、PID 已确认退出且锁文件在删除前未被替换时才会自动清理。

冲突标记检查默认 `block`，只匹配行首的 `<<<<<<<`、`=======`、`>>>>>>>`，跳过依赖、生成、缓存和构建目录，并且不读取超过 2 MiB 的文件。

## 项目配置

在 Git 根目录创建 `.git-delivery-guards.mjs`：

```js
export default {
  checks: {
    mergeConflict: "block",
  },
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { mergeConflict: "report" },
    },
  ],
};
```

模式可以是 `block`、`report` 或 `off`。同一检查使用第一个声明该检查的路径 override。

提交边界使用 `.ai-experts/commit-boundaries.json`：

```json
{
  "version": 1,
  "boundaries": [
    { "id": "frontend", "prefixes": ["apps/web"] },
    { "id": "backend", "prefixes": ["apps/api"] }
  ]
}
```

未声明时按最近的项目 manifest 推导边界。配置存在但无效时，相关 commit 会被阻断并要求修复配置。

从 `source-sanity-guard@0.1.0` 升级时，将 `.source-sanity-guard.mjs` 中的 `mergeConflict` 模式和对应 override 原样移入 `.git-delivery-guards.mjs`；旧插件不再读取该字段。

完整契约见 [DESIGN.md](./DESIGN.md)，也可以使用插件自带的 `git-delivery-guards-config` Skill 维护配置。

## 验证

```bash
node --test plugins/git-delivery-guards/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin git-delivery-guards
```

Version: `0.2.0`
