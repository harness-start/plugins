# Python 工程插件

`python-engineering` 面向 Python 打包、类型、pytest、异步代码、服务与 CLI。Skill 负责项目识别和开放式实现，Hook 保护包管理器状态并执行轻量语法、Ruff 与 JSON 检查。

## 目标

- 根据仓库声明选择 Python 版本、包管理器、框架和验证命令。
- 防止直接编辑 `pdm.lock`、`Pipfile.lock`、`poetry.lock`、`uv.lock` 以及虚拟环境目录。
- 对本次写入的 Python 源码与 JSON 配置给出快速反馈。
- 不把语法或 Ruff 检查替代类型检查、pytest、应用启动和集成验证。

## 实现

插件捆绑 `python-engineering` 主 Skill，不预设 FastAPI、Django 或其他框架。两个宿主的 `PreToolUse` 拒绝对受保护 lockfile、`.venv/`、`venv/` 和 `__pypackages__/` 的直接写入；`PostToolUse` 对 `.py` 运行阻断式语法检查和报告式 Ruff 检查，对 `.json` 运行阻断式结构检查。Hook 只处理可识别、已存在且大小有界的本次目标。

## 配置

在 Git 根目录创建 `.python-engineering.mjs`：

```js
export default {
  checks: {
    pythonSyntax: "block",
    ruff: "report",
    pythonJson: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。包管理器命令未明确写入受保护目标时不会被命令名称本身阻断。

## 使用与验证

安装后调用 `$python-engineering` 或 `/python-engineering`，完成前运行项目声明的 pytest、类型检查、lint、构建或服务验证。

```bash
npx tsx --test plugins/python-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin python-engineering
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
