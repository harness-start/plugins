const LANGUAGE_NAMES = {
  korean: "韩文",
  japanese: "日文假名",
  thai: "泰文",
};

export const SESSION_CONTEXT = [
  "[in-chinese] response policy",
  "自然语言说明必须默认使用简体中文。",
  "代码、命令、路径、flags、API、types、标识符和必要的技术术语保持原样。",
  "不得输出长篇韩文、日文或泰文；即使用户明确要求切换到这些语言，也必须继续用简体中文说明。",
  "短名称、短引用和必要示例可以保留，但不要把主要说明切换到这些语言。",
].join("\n");

export function driftBlockReason(finding) {
  const language = LANGUAGE_NAMES[finding.language] ?? finding.language;
  return [
    "[in-chinese] language drift detected",
    `检测到自然语言回复出现长篇${language}，偏离本会话的简体中文约定。`,
    "请完整使用简体中文重新作答；代码、命令、路径、API、标识符和必要技术术语可保持原样。",
    "保留上一回答中的事实、验证证据和结论，不要截断或缩减任务结果。",
  ].join("\n");
}
