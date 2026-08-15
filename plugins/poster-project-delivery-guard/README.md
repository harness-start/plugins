# Poster Project Delivery Guard

`poster-project-delivery-guard` 管 `artifacts/poster/<poster-id>/` 下用 React/TSX、Satori 和 resvg 做的海报工程。它查 variant 和 layer 顺序、文件 role、带 source-hash 的 SVG/PNG 预览、交付文件，以及 release receipt 还新不新。

它不打分审美，也不自带 renderer 或 reviewer。登记的工具只有 lint 和 release：预览、成品和 evidence 由项目自己的流水线生成；结构不对或已经过期的交付会被拒。

## 最小目录

```text
artifacts/poster/launch-poster/
  .gitignore
  package.json
  package-lock.json
  plan.contract.json
  plan.assets.json
  poster.project.json
  src/
    render.ts
    compose.ts
    theme.ts
    variants/
      manifest.json
      001-main/
        variant.json
        layers/
          manifest.json
          001-background-base.tsx
          001-background-base.<source-sha256>.svg
          001-background-base.<source-sha256>.png
  data/001-main.json
  dist/launch-poster.main.png
  evidence.accessibility.json
  review.poster.json
  release.manifest.json
  receipt.release.json
```

`src/variants/manifest.json` 是 variant 的唯一顺序；每个 `layers/manifest.json` 是该 variant 的唯一叠放顺序，第一层必须为 `background`。layer 文件使用 `NNN-<role>-slug.tsx`，只导出一个 `buildLayer`，不能自行设置 `zIndex`、调用 Satori/resvg、访问 I/O 或网络、使用 React client Hook，也不能导入 sibling layer。

## 生成 proof 和 evidence

项目渲染器对每个 layer 源文件的原始字节计算小写 SHA-256，并在同目录生成 `<stem>.<sha256>.svg` 与 `.png`。两份预览都必须来自同一次当前源码渲染，且分别为可识别的 SVG 文档和 PNG（至少有 PNG 签名）。随后组合各 variant，写入 `dist/<poster-id>.<variant-id>.png`，并由实际无障碍检查和具名审查流程写入：

- `evidence.accessibility.json`：schema、当前 `subjectDigest`、检查工具、结论和至少一项 check；
- `review.poster.json`：独立 reviewer、`pass` 结论，以及与当前源码一致的 `subjectDigest`；
- `release.manifest.json`：schema、当前 `subjectDigest`，以及每个 variant 的 dist 输出路径。

空 `{}`、假 SVG/PNG 文本、或绑在过期 subject 上的 review 都不能签发。这仍不能证明像素一定由该 TSX 渲出，只排除桩文件和过期回执。

受保护路径只能由登记 writer 写入，而当前版本没有登记 render/review writer。因此已启用 Hook 的 agent 不能直接生成上述文件；应由安装前或宿主外的受信任项目流水线生成，再进入插件校验与签发阶段。`project-release.mjs` 只签发 receipt，不会补生成预览、PNG 或 evidence。

写保护和 Stop 按仓库根解析：即使 cwd 在 `artifacts/poster/<id>/` 里，也不能用相对路径手写 `dist/` 或 proof。shell 只允许只读命令，或参数形状精确匹配的 `project-lint.mjs` / `project-release.mjs`；`sed`、`dd`、`node -e` 以及只在命令里提到 wrapper 路径的调用都会被拒绝。仓库根上与海报无关的命令不受影响。

## 校验与发布

在 marketplace 根目录运行；每条 writer 命令都应单独提交：

```bash
node plugins/poster-project-delivery-guard/dist/cli/project-lint.mjs artifacts/poster/launch-poster
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-manual}" AI_EXPERTS_TRIGGER_FROM="poster-project-delivery-guard:manual-release" node plugins/poster-project-delivery-guard/dist/cli/project-release.mjs artifacts/poster/launch-poster
```

lint 从 artifact 自己的依赖中加载 ESLint/parser，因此干净环境要先在 artifact root 按 lockfile 安装依赖。release 会先验证全部 layer proof、variant 输出和 evidence，再通过 `.poster-delivery-journal.json` 原子写入 `receipt.release.json`。任何非生成输入或交付字节变化都会使旧 receipt 失效。

## 失败恢复

- `LAYER_PROOF_MISSING`：重新运行项目 renderer，为 finding 指向的源码生成当前 hash 的 SVG/PNG；不要重命名旧预览冒充新结果。
- `RELEASE_PATH_MISSING`：让项目流水线补齐指定成品或审查文件，再重跑 lint 和 release。
- `RECEIPT_INVALID`：源码或输出在签发后变化；重新生成受影响内容并重新签发。
- `MUTATION_JOURNAL_OPEN`：确认没有 release writer 仍在运行，检查半写入的 receipt 和临时文件；必要时在停用本插件 Hook 的维护窗口删除本项目残留 journal/临时文件，然后从 lint 重新开始。
- `PROTECTED_WRITER_REQUIRED` 或 `UNKNOWN_MUTATION_SHELL`：该写入没有执行。不要重复提交相同命令，改用受信任项目流水线或已登记工具。

## 宿主差异与验证

Claude Code 注入 `CLAUDE_PLUGIN_ROOT` 并提供 `PostToolUseFailure`；Codex 注入 `PLUGIN_ROOT`，Hook 命令还设置 `AI_EXPERTS_SESSION_ID` 与 `AI_EXPERTS_TRIGGER_FROM`。安装态调用 writer 时须使用对应变量或已安装插件的精确绝对路径，不能使用 `...` 占位。两者都会在 `Stop`/`SubagentStop` 重算项目闭包。Hook 是宿主工具边界，不是操作系统沙箱；宿主外进程仍超出其可观察范围。

在 marketplace 根目录运行离线测试：

```bash
npx tsx --test plugins/poster-project-delivery-guard/tests/*.test.ts
```

`skill-deps.json` 声明的可选设计顾问只给只读建议，不能当 renderer、reviewer 或 release writer。
