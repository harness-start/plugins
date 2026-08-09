# Artifact delivery guards

这组插件把视觉产物当作可审计工程，而不是单个二进制文件。当前包含 PPTX、海报、Remotion 视频、Logo 和印刷出版物五个相互独立的插件；每个插件都自带 Hook、合同校验器、ESLint preset、release writer、测试与验收 fixture，不依赖共享 runtime，也不在安装阶段编译或下载渲染依赖。

## 共同边界

- 工程根固定为 `artifacts/<carrier>/<kebab-case-id>/`，`plan.contract.json` 决定 Stop 需要关闭到 `source` 还是 `release`。
- 文件名负责发现和投影；真正 freshness 由 SHA-256 receipt 绑定。receipt 同时绑定非生成输入集合和最终输出的原始字节。
- preview、proof、`build/`、`dist/`、`evidence*`、review、release manifest 和 receipt 都是交付血缘，不应加入 `.gitignore`。
- 普通文件 Tool 不能写生成路径。artifact root 内的未知 mutation shell 同样拒绝；项目本地 ESLint 只能通过插件 wrapper 加载强制 preset。
- release writer 以独占 journal 和临时文件 + rename 生成 receipt。中断 journal 会阻断 Stop，不能把半套输出当成完成态。
- Stop 只做有界扫描、合同与 receipt freshness 校验，不在完成阶段启动 Office、Chrome、编码器或 PDF preflight。

## ESLint 与跨文件合同

每个插件的 `eslint/preset.mjs` 和 `eslint/local-rules/` 只处理单文件 AST 能可靠表达的 owner 边界；`scripts/tools/project-lint.mjs` 从 artifact 自己的 `package.json` 解析本地 `eslint` 与 `@typescript-eslint/parser`，不使用全局包或 `npx`。

文件名、manifest 顺序、source-hash proof、跨文件依赖、最终输出和 receipt 由 `scripts/lib/contract.mjs` 复核。正则合同不是 ESLint 的降级替代，而是 Hook 在没有 artifact toolchain 时仍能 fail closed 的最小闭包。

## 生成依赖与社区 Skill

渲染器属于 artifact 工程：PptxGenJS、Satori/resvg、Remotion、React/Vivliostyle 及其版本应由项目 `package-lock.json` 固定。插件只提供约束和 writer，不代替项目构建脚本。

社区 Skill 是知识层，不是执行层。PPTX 与海报插件通过 `skill-deps.json` 固定 `ui-ux-pro-max` 的来源 commit；其建议必须重新经过本插件的 source、proof 和 release 合同。Skill 激活、提示词质量或“看起来不错”都不是 operational evidence。

## 强度声明

当前是 `snapshot` profile：已登记的文件 Tool 写路径和常见 shell mutation 可在执行前拒绝，Post/Stop 会重新扫描实际工作区。它不是操作系统沙箱；如果宿主允许插件不可见的进程直接改磁盘，不能宣称 `closed`。审美、商标可注册性、印厂签字或内容真实性也不由这些 Hook 自动证明。

载体细节见各插件的 `DESIGN.md`。
