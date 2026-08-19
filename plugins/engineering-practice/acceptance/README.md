# 双宿主验收

从仓库根目录运行：

```bash
./scripts/acceptance/run.sh --plugin engineering-practice
```

脚本会在 `docker/host-acceptance` 容器内为 Claude Code 和 Codex 创建隔离会话。本插件自带 Skill，不再安装社区依赖。

- `01-implementation-and-verify`：不在 prompt 中点名 Skill 或复述工程流程；验证新增行为、现有公共 seam、测试覆盖和最终测试结果。
- `02-review-regression`：只要求审查当前实现；验证只读、严重级别和精确文件锚点。
- `03-simple-control`：简单精确回复只接收 SessionStart 上下文，不加载工程 Skill。
- `04-contract-boundary`：只给出一个边界故障，验证 agent 会保留文档规定的返回类型、容器形状、其他基数和异常合同，而不是只让示例不报错。
- `05-shared-return-path`：边界输入触发底层失败；验证修复复用共同转换/返回路径，并保持两种公开调用形式的容器合同。
- `06-cardinality-seam`：三组组合暴露顺序误报；验证 agent 扩展原有命名 seam、保留旧调用，并覆盖零、一、二、多组输入，而不是另建私有平行实现。
- `07-mixed-boundary`：UserPromptSubmit 对联合 normalization 做窄路由；Stop 对有损变换之后才新增的空值短路和前移后新发明的混合拒绝做高置信门禁；验证 agent 在首个有损变换前处理一空一 singleton，并逐分量保留值和形状。
- `08-stable-order-primitive`：UserPromptSubmit 对依赖顺序与被质疑的诊断内容做窄路由；Stop 在 diff 手写依赖排序且仓库已有 stable primitive、variadic seam 或其调用方新增单输入原样旁路、或 cycle 诊断改用内部元素时门禁；验证 agent 复用现有 primitive，覆盖独立链 stable ready-frontier、公开调用方重复项、统一容器、cycle fallback 和完整原始输入级精确诊断。

验收只证明这些固定场景中的依赖安装、平台化路由注入和结果，不把模型是否每次主动调用或读取 Skill 当作稳定硬门禁，也不外推为所有任务的质量保证。实际加载仍保留在 live 日志中供观测。
