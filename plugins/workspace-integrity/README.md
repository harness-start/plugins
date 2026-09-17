# workspace-integrity

`workspace-integrity` 保护工作树的表示与改写边界。它在执行前拦截不安全的 shell 形态，保护生成文件或依赖管理器拥有的路径，检查源码编码和备份残留，并施加窄的领域感知改写守卫，而不发布语言百科全书式 Skill。

adb、Docker、Kubernetes 和 journald 的运行时日志必须先经过捆绑的脱敏边界，才能进入宿主会话：

```sh
adb logcat -d | node "$PLUGIN_ROOT/dist/cli/harness.mjs" logs sanitize
```

先收窄生产者查询。脱敏器会遮盖常见凭据赋值、bearer token 和 URL 密码，并拒绝超过 16 MiB 的输入。

## 用途

许多 agent 失败与所请求的功能无关：用错误的包管理器改写 lockfile、直接改生成物、留下备份垃圾、引入非法 UTF-8，或用被掩盖的 shell 命令绕过复核。本 owner 为 Claude Code 与 Codex 提供一层可预期的完整性地板。

## 设计

owner 把 Hook 事件在进程内派发到 `src/domains/` 下的实现。通用职责由 `commands`、`source` 和 `quality` 拥有。领域改写守卫由 `android`、`go`、`ios`、`java`、`kubernetes`、`nix`、`php`、`python`、`react-native`、`rust` 和 `web` 实现。每个域共享 owner 的 Hook、Skill、测试、验收、license 和构建边界。

领域守卫在写入前分类受保护路径和危险改写形态，在观察到改写后运行有界确定性校验器，并报告选定的语义风险。建议性检查可设为 `report` 或 `off`；项目配置若请求 `block` 会被钳到 `report`。确定性检查支持 `block`、`report` 和 `off`。捆绑的工程 Skill 可用，但不是 Hook 前提。安装 owner 即激活全部保护，没有能力 profile。

## 能力

| 范围 | 模块 | 保护内容 |
| --- | --- | --- |
| Shell 与命令安全 | `commands` | 破坏性或不透明的 shell 改写、掩盖验证、敏感读取，以及项目定义的 allow/deny/report 规则 |
| 源码表示 | `source` | 备份残留、乱码替换字符、BOM、非法 UTF-8，以及按路径的覆盖 |
| 共享质量地板 | `quality` | 源文件行数预算与确定性 Markdown 结构检查 |
| 移动与 Apple 项目 | `android`、`ios`、`react-native` | 生成的项目文件、依赖锁、清单和框架特定改写边界 |
| 后端与系统语言 | `go`、`java`、`php`、`python`、`rust` | 语言特定生成文件、锁、元数据和有界受保护目标 |
| Web 项目 | `web` | 前端包目标与锁所有权；React Native 特有目标让给对应模块 |
| 声明式运维 | `kubernetes`、`nix` | Helm/Kubernetes 依赖状态、清单，以及 Nix 生成或锁拥有的路径 |

## 适用场景

任何 agent 能跑 shell 或改源码的仓库都应使用。多语言工作区、生成代码项目、移动仓库、包管理应用、基础设施仓库，以及希望在领域工作流开始前先有共同命令/源码完整性合同的团队尤其有价值。

## 不适用场景

不要用它替代项目测试、编译器检查、安全扫描、代码评审或语言 IDE。它不承诺为每种支持语言做 lint 或 format，不教语言工程，也不验证任意业务语义。Kubernetes 运维方法由 `delivery-governance` 暴露；本 owner 只施加对应的工作区完整性保护。

## 运行时行为

`PreToolUse` 上，一条聚合领域路由与通用处理器一起调用所有匹配策略。任何确定性 deny 立即返回；建议性上下文可以合并。质量处理器会投影直接的 `Write`、`Edit`、`MultiEdit` 和 `apply_patch` 内容，从而在改写前拒绝可预测的行数预算违规。`PostToolUse` 上，领域校验器与扫描，加上 `commands`、`quality` 和 `source`，检查观察到的写入。确定性领域阻断会按工作区、会话、策略、检查和路径在插件数据中记债。`Stop` 重新验证该债，文件仍无效或无法核验时阻止完成。债未清时，`PreToolUse` 还会拒绝无关动作，但允许直接修复或删除受影响路径，覆盖那些在尝试完成前不发 `Stop` 的宿主。干净重跑或删除会清债。会话/插件数据身份不可用时持久化 fail-open，但立即的写后检查仍会跑。带 `stop_hook_active` 的重试不循环。Skill 名从来不是强制执行的前提。

路径抽取覆盖宿主文件工具、补丁、移动、重定向和常见 shell writer。每个模块限定在当前工具调用和仓库中的证据；别处存在某个语言文件，并不授权大范围自动工作流。

## 公开接口

公开目录刻意紧凑：十个隐式领域入口 Skill 是 `android-engineering`、`go-engineering`、`ios-engineering`、`java-engineering`、`nix-engineering`、`php-engineering`、`python-engineering`、`react-native-engineering`、`rust-engineering` 和 `web-frontend-engineering`，加上仅显式调用的 `workspace-integrity-config` Skill。专门的框架、测试、迁移和性能方法作为所属领域入口内的渐进参考，而不是可独立发现的 Skill。Kubernetes 操作方法必须从 `delivery-governance` 调用；本 owner 只保留其完整性 Hook 策略。

`workspace-integrity-config` 覆盖现有的 `.command-safety.mjs`、`.source-integrity.mjs`、`.engineering-quality.mjs` 以及领域 `.*-engineering.mjs` / `.kubernetes-operations.mjs` 文件，不重命名或合并它们的运行时 schema。公开 `logs` CLI 资源只通过 `dist/cli/harness.mjs` 暴露确定性的 `sanitize` 动作；本 owner 不暴露 MCP 服务器。

## 配置与状态

项目拥有的 JavaScript 配置可以增加窄路径规则、改支持的检查模式，并调整有界阈值。`commands` 可以保留会话本地的升级状态；`quality` 和确定性领域检查可以在宿主提供的插件数据下保留完成债。无效配置条目按各模块 schema 拒绝或忽略，内置保护仍然可用。

## 边界

Hook 只能约束 Claude Code 或 Codex 可见的工具活动，不是操作系统沙箱。一次被拒绝的写入证明拦住了已知的不安全形态；一次被允许的写入不证明正确。领域处理器刻意覆盖改写完整性，而不是全面的语言强制。生成文件所有权和 lockfile 规则仍依赖可识别的项目证据，无法推断未文档化的自定义生成器。

## 验证

```bash
node --import tsx --test \
  plugins/workspace-integrity/tests/*.test.ts \
  plugins/workspace-integrity/tests/domains/**/*.test.ts
npm run check:dist
```

实时双宿主用例只能通过 `./scripts/acceptance/run.sh --plugin workspace-integrity` 运行，该命令执行强制的 Docker 宿主验收策略。
