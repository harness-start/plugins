const CAT_HEREDOC_WRITE_RE =
  /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;

function isInTmp(command) {
  const match = command.match(
    /(?:>|>>)\s*(\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/,
  );
  return Boolean(match);
}

function isPipeInput(command) {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}

export function catWriteClassification(command) {
  if (typeof command !== "string" || !CAT_HEREDOC_WRITE_RE.test(command)) {
    return { action: "allow" };
  }
  if (isPipeInput(command)) return { action: "allow" };
  if (isInTmp(command)) {
    return {
      action: "report",
      reason: "cat heredoc writes a temporary file outside file-aware hooks",
    };
  }
  return {
    action: "deny",
    reason: "cat heredoc writes a repository file outside file-aware hooks",
  };
}

export function catWriteDenyMessage(command) {
  return [
    "[Cat Write Guard] 已拦截 cat heredoc 写文件",
    "",
    "通过 Bash 的 cat heredoc 写文件会绕过所有 PostToolUse hook：",
    "  • 语法检查器不会执行",
    "  • file-line-budget-guard 不会检查行数预算",
    "  • encoding guards 不会检查编码",
    "  • 路径守卫不会检查写入目标",
    "",
    `命令：${command}`,
    "",
    "替代方案：新建文件使用 Write，修改文件使用 Edit/apply_patch。",
    "",
    "blockingContract:",
    "  observedFacts: Bash 输入包含重定向到非临时文件的 cat heredoc。",
    "  harm: 该写入会绕过文件感知的目标检查、变更钩子与写后验证。",
    "  unblockWhen: heredoc 仅作为管道输入、仅写入允许的临时目录，或改用文件感知编辑工具。",
    "  recovery: 使用 Write、Edit 或 apply_patch 应用内容，使路径守卫与验证 hook 能观察变更。",
  ].join("\n");
}

export function catWriteReportMessage(command) {
  return [
    "[Cat Write Guard] 检测到 cat heredoc 写入临时文件",
    "",
    "Bash cat heredoc 写文件不会触发文件感知的 PostToolUse 检查。",
    "临时脚本可以继续，但建议优先使用 Write 工具。",
    `命令：${command}`,
  ].join("\n");
}
