# engineering-quality

`engineering-quality` 在 Claude Code 和 Codex 写入文件后执行跨技术栈共享的质量门禁：源码文件行数预算与 Markdown 结构检查。语言语法、lint、格式化、依赖文件保护和生态工具检查由对应领域插件负责。

## 默认检查

| 范围 | 检查 | 默认模式 |
| --- | --- | --- |
| 常见源码与构建文件 | 新文件/刚越线文件阻断，历史超大文件采用只减不增的 ratchet | `block` |
| Dockerfile / Containerfile | 500 行预算 | `report` |
| 测试、fixture、生成物、第三方与构建目录 | 不执行行数门禁 | `skip` |
| Markdown | 标题层级、空行、空白、代码围栏、结尾换行等结构 | 多数 `block`，代码围栏语言 `report` |

`PostToolUse` 从文件工具和明确的 shell 写入中提取最终目标文件。Hook 不安装依赖、不访问网络，也不执行项目配置提供的命令。

## 项目配置

在 Git 根目录创建 `.engineering-quality.mjs`。行数规则按顺序匹配，项目规则先于内置规则；Markdown override 也是首个声明对应检查的匹配项生效。

```js
export default {
  rules: [
    { match: /^src\/generated\//, mode: "skip" },
    { match: /^src\/legacy\//, budget: 900, mode: "report" },
  ],
  settings: {
    nearBudgetWarnRatio: 0.8,
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 100,
  },
  checks: {
    fencedCodeLanguage: "report",
    singleH1: "off",
  },
  overrides: [
    {
      match: /^fixtures\//,
      checks: { trailingWhitespace: "off" },
    },
  ],
};
```

行数规则的 `mode` 为 `block`、`report` 或 `skip`；非 `skip` 规则必须提供正数 `budget`。Markdown 检查模式为 `block`、`report` 或 `off`。配置项非法时会报告并回退安全默认值。

使用 `engineering-quality-config` Skill 可以初始化或诊断配置。

## 验证

```bash
npx tsx --test plugins/engineering-quality/tests/*.test.ts
./scripts/acceptance/run.sh --plugin engineering-quality
```

版本：`0.3.0`
