# Go 工程插件

`go-engineering` 面向 Go module、服务、CLI、并发、错误处理、测试与发布任务。Skill 负责开放式工程决策，Hook 负责保护工具链拥有的校验和文件并运行轻量格式检查。

## 目标

- 沿用项目声明的 Go 版本、模块边界和验证命令完成实现或审查。
- 防止直接手改 `go.sum`，要求从 `go.mod` 或 import 变化出发由 Go 工具链重新生成。
- 对本次修改的 Go 源码提供快速、范围有界的 `gofmt` 反馈。

## 实现

- `go-engineering` Skill 组织项目识别、实现、测试和验证。
- `PreToolUse` 检测文件工具及可识别 shell 写目标；直接写 `go.sum` 时拒绝并给出恢复方法。
- `PostToolUse` 对修改后的 `.go` 文件运行 `gofmt` 检查，默认以 `report` 模式反馈。
- Hook 跳过依赖、缓存、生成和构建目录，并限制文件数、文件大小及单次工具超时。

Hook 只证明本次可观察写入符合上述机械规则，不证明 `go test`、race detector、编译、集成行为或性能已经通过。

## 配置

Git 根目录的 `.go-engineering.mjs` 可调整检查模式和资源上限：

```js
export default {
  checks: { gofmt: "report" },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式为 `block`、`report` 或 `off`。包管理器命令没有明确写入受保护路径时保持放行。

## 使用与验证

安装后调用 `$go-engineering` 或 `/go-engineering`。任务完成前运行项目自己的 `go test`、`go vet`、构建或其他声明命令。

```bash
npx tsx --test plugins/go-engineering/tests/*.test.ts
./scripts/acceptance/run.sh --plugin go-engineering
```

live acceptance 只允许通过上述脚本在 `docker/host-acceptance` 中执行。版本：`0.1.0`。
