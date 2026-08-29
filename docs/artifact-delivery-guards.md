# Artifact delivery guards

这组插件把视觉与音频产物当作可审计工程，而不是单个二进制文件。当前包含图表、PPTX、海报、Remotion 视频、Logo、印刷出版物和 Tone.js 音乐七个相互独立的插件；每个插件都自带 Hook、合同校验器、release writer、测试与验收 fixture，并按源码形态提供 ESLint preset 或结构化 source lint。它们不依赖共享 runtime，也不在插件安装阶段编译或下载渲染依赖。

## 共同边界

- 工程根固定为 `artifacts/<carrier>/<kebab-case-id>/`，`plan.contract.json` 决定 Stop 需要关闭到 `source` 还是 `release`。
- 文件名负责发现和投影；真正 freshness 由 SHA-256 receipt 绑定。receipt 同时绑定非生成输入集合和最终输出的原始字节。
- preview、proof、`build/`、`dist/`、`evidence*`、review、release manifest 和 receipt 都是交付血缘，不应加入 `.gitignore`。
- 普通文件 Tool 不能写生成路径。artifact root 内只允许只读命令或严格解析的单一 writer 命令；writer 还必须消费 Pre Hook 针对 project root、完整 argv 和 host session 签发的一次性 capability。项目本地 ESLint 只能通过插件 wrapper 加载强制 preset。
- writer 以独占 journal 和临时文件 + rename 生成输出。中断 journal 会阻断 Stop，不能把半套输出当成完成态。
- Stop 只做有界扫描、合同与 receipt freshness 校验，不在完成阶段启动 Office、Chrome、编码器或 PDF preflight。Post/Failure Hook 在平台插件数据目录按 workspace、carrier 与 session 的摘要键记录会话参与，使后续从仓库根目录触发的同会话 Stop 仍会复核；没有参与标记的无关会话不得被陈旧项目阻断。

## ESLint 与跨文件合同

存在可执行 TS/TSX 单元的插件，用各 owner 的 `src/domains/<domain>/lib/eslint/` 处理单文件 AST 能可靠表达的边界；只有结构化 JSON 源的图表领域直接执行 schema、引用和密度合同。需要 ESLint 时，通过 owner 的 `dist/cli/harness.mjs <resource> lint` 从 artifact 自己的 `package.json` 解析本地依赖，不使用全局包或 `npx`。

文件名、manifest 顺序、source-hash proof、跨文件依赖、最终输出和 receipt 由 `src/lib/contract.ts` 复核，并随各 entry 打入 bundle。正则合同不是 ESLint 的降级替代，而是 Hook 在没有 artifact toolchain 时仍能 fail closed 的最小闭包。

## 生成依赖与社区 Skill

渲染依赖属于 artifact 工程：PptxGenJS、ELK/resvg/fontsource、Satori/resvg、Remotion、React/Vivliostyle、Tone.js、Tonal、Playwright 及其版本应由项目 `package-lock.json` 固定。图表插件从语义 JSON 经确定性 Scene IR 生成自包含 SVG/HTML、PNG 与可选 draw.io，并对 Mermaid/draw.io 导入记录 fidelity ledger。项目拥有的 render scripts 是受信任可执行配置；插件 writer 负责固定调用边界、测量输出并生成结构化 proof，不把脚本存在本身当作 operational evidence。音乐插件提供受控的浏览器离线渲染 wrapper；其他守卫不代替项目构建脚本。视频 writer 还要求系统提供 ffmpeg/ffprobe。

Skill 是知识层，不是效果证据。图表、PPTX、海报与音乐插件把设计顾问和方法正文捆绑在各自 `skills/` 里。所有建议都必须重新经过对应插件的 source、proof 和 release 合同。Skill 激活、提示词质量、优化分数或“听起来不错”的文字判断都不是完整 operational evidence。

## 强度声明

当前是 `snapshot` profile：已登记的文件 Tool 写路径和常见 shell mutation 可在执行前拒绝，Post/Stop 会重新扫描实际工作区。它不是操作系统沙箱；如果宿主允许插件不可见的进程直接改磁盘，不能宣称 `closed`。审美、音乐品味、商标可注册性、印厂签字或内容真实性也不由这些 Hook 自动证明。

载体细节见各插件的 `README.md`。
