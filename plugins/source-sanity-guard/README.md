# source-sanity-guard

`source-sanity-guard` 在 Claude Code 和 Codex 编辑源码时拦截三类低误报问题：源码目录中的备份或临时文件、明显由解码损坏产生的 `U+FFFD` 替换字符，以及写入后仍留在文件中的合并冲突标记。

写前检查只监听文件工具，不分析 Bash 或其他命令。写后检查读取最终文件，发现冲突标记时不会回滚已经发生的写入，而是要求代理先修复再继续。

## 默认行为

| 检查 | 阶段 | 默认模式 |
| --- | --- | --- |
| 源码目录中的 `.bak`、`.orig`、`.tmp`、尾随 `~` 等文件 | PreToolUse | `block` |
| 连续至少 2 个或累计至少 3 个 `U+FFFD` | PreToolUse | `block` |
| 行首的 `<<<<<<<`、`=======`、`>>>>>>>` | PostToolUse | `block` |

`node_modules/`、`vendor/`、生成目录、构建输出、二进制文件、已删除文件和超过 2 MiB 的文件不会被扫描。

## 项目配置

在 Git 项目根目录创建 `.source-sanity-guard.mjs`：

```js
export default {
  checks: {
    backupArtifact: "block",
    garbledText: "block",
    mergeConflict: "block",
  },
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { garbledText: "off" },
    },
  ],
};
```

模式可以是 `block`、`report` 或 `off`。同一检查使用第一个匹配的 override；配置只能调整内置检查，不能定义新的内容扫描器。完整契约见 [DESIGN.md](./DESIGN.md)，也可以使用插件自带的 `source-sanity-guard-config` Skill 维护配置。

## 验证

```bash
node --test plugins/source-sanity-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin source-sanity-guard
```

Version: `0.1.0`
