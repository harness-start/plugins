# work-reporting

`work-reporting` 生成一份同时服务员工与 TL 的证据化工作报告：员工能看见可观察的不足、确认或质疑改进项并承诺下一步；TL 能看到工作明细、成果影响、证据强度、数据缺口和后续核验矩阵。插件不自动计算绩效分，也不发送或上传报告。

## 统一入口

- `$work-report-authoring`：daily / weekly / summary 的统一编排入口，可手动调用，也由 `UserPromptSubmit` 对明确的日报、周报、阶段总结意图自动提示。
- `$work-report-review`：TL 的只读复核入口，校验报告/ledger、证据等级、承诺和待核事项。
- `$work-report-authoring`：唯一写作编排入口，根据请求选择日报、周报或日期范围，不提供旧名称适配器。

外部 `$grill-me`、`$brag-sheet`、`$growth-log`、`$performance-review-writer` 均是固定 revision、阶段限定、`required:false` 的 advisor。插件忽略其工具调用和保存指令，只接纳经过本地证据复核的建议；依赖不可用时使用编排 Skill 内置方法继续。

## 证据边界

`collect` 先扫描 Claude/Codex transcript，再从时间窗内 session CWD 向上解析 Git root，并与重复的 `--repo PATH` 去重。只在仓库 `user.name`/`user.email` 与 commit 作者匹配时标为 attributed；其余 ownership 为 unverified。不会扫描整个 HOME。

若仓库 origin 指向 GitHub/GitLab，只有在 `gh`/`glab` 已安装且已经认证时才查询该仓库的 PR/MR；插件从不触发登录，也不做账号级全量扫描。`--skip-git`、`--skip-remote` 是真实 opt-out；上限由 `--max-repos`、`--max-commits`、`--max-sessions` 控制。`collect`/`scan` 可用 `--output PATH` 写出受保护报告树之外的新 JSON 文件。

## V2 合同与确认

`EvidenceBundleV2` 为每条 transcript、Git、forge 证据记录稳定 ID、时间、脱敏 locator、digest、ownership、verification 和 data gap。`WorkReportContractV2` 将工作、改进、上期承诺、本期行动、员工 disposition、TL 验证和 advisor provenance 绑定到 evidence ID，再确定性渲染单一 Markdown。

V2 官方命令使用：

```bash
node daily-work-report-prepare.mjs --date YYYY-MM-DD --contract contract.json --evidence evidence.json
node weekly-work-report-prepare.mjs --week YYYY-Www --contract contract.json --evidence evidence.json
node work-summary-report-prepare.mjs --from YYYY-MM-DD --to YYYY-MM-DD --contract contract.json --evidence evidence.json
# 将 prepare 替换为 save，即为三个对应的保存命令。
```

prepare 后 hook 给出一次性 token。员工必须严格回复：

```text
# work-report-ack <token> | G1=accepted | G2=disputed:<reason> | commit=A1
```

token 绑定合同与证据 digest；任何变化都会失效。accepted finding 必须绑定 commitment；disputed/needs-context 必须有理由和 TL follow-up。weekly/summary 强制 1–3 个承诺。保存状态只能 `prepared → acknowledged → saved`。同源 `.ledger.json` 绑定 Markdown digest，用于下期承诺 carry-over，不是第二份用户报告。

## 完整性与 Hook

旧 v0.2 报告仍可校验。旧的任意 suffix 会标为 `legacySuffixUnverified`；首次 V2 append 将旧文件全部字节纳入 previous-file digest。此后的每个 addition 都形成连续 SHA-256 链，任一旧字节或新增字节变化都会失败。

- `UserPromptSubmit`：对明确报告意图提供 `$work-report-authoring` 路由；“报告 bug”等近似文本静默绕过；只保存 acknowledgement 的结构化 digest，不保存原始回复。
- `SessionStart`：只恢复未完成流程，普通会话静默。
- `PreToolUse`：保护 report/ledger，验证官方命令、候选 digest、确认 token 和状态迁移。
- `PostToolUse` / `PostToolUseFailure`：核验成功回执或保留失败恢复信息。
- `Stop`：阻止未保存却声称完成，并避免递归阻断。

## 本地验证

```bash
npx tsx --test plugins/work-reporting/tests/*.test.ts
npx tsx scripts/build-plugins.ts --check --plugin work-reporting
npm run check:dist
```

Live acceptance 必须通过项目的 Docker host-acceptance 入口运行。
