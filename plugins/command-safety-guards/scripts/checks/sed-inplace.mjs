const SED_INPLACE_PATTERNS = [
  {
    test(command) {
      const expression = /\bsed\s+(?:-[A-Za-z]*i)(?=[^A-Za-z]|$)/g;
      let match;
      while ((match = expression.exec(command)) !== null) {
        const after = command.slice(match.index + match[0].length);
        if (/^[.'"]\S*/.test(after)) continue;
        if (/^\s+(?:''|"")(?:\s|$)/.test(after)) continue;
        return true;
      }
      return false;
    },
    reason: "sed -i 会原地修改文件且不创建备份，无法回滚",
  },
  {
    test(command) {
      return /\bsed\s+[^|;]*--in-place(?!=)\b/.test(command);
    },
    reason: "sed --in-place 会原地修改文件且不创建备份，无法回滚",
  },
];

function stripMessagePayloads(command) {
  let stripped = command.replace(
    /\$\(cat\s+<<'?(\w+)'?\n[\s\S]*?\n\1\s*\)/g,
    " __HEREDOC__ ",
  );
  stripped = stripped.replace(
    /\bgit\s+commit\b[^;|&]*/,
    (commitCommand) =>
      commitCommand
        .replace(/-m\s+"(?:[^"\\]|\\.)*"/g, '-m "__MSG__"')
        .replace(/-m\s+'[^']*'/g, "-m '__MSG__'"),
  );
  return stripped;
}

export function sedInplaceHit(command) {
  if (typeof command !== "string" || !command) return false;
  const sanitized = stripMessagePayloads(command);
  return SED_INPLACE_PATTERNS.some((pattern) => pattern.test(sanitized));
}

export function sedInplaceDenyMessage(command) {
  const sanitized = stripMessagePayloads(command);
  const pattern = SED_INPLACE_PATTERNS.find((candidate) =>
    candidate.test(sanitized),
  );
  const reason = pattern?.reason ?? "sed 原地修改没有可恢复的备份";
  return [
    "[sed -i Guard] 已拦截 sed 原地修改命令",
    "",
    `原因：${reason}`,
    `命令：${command}`,
    "",
    "替代方案：使用 Edit/apply_patch，或使用带明确备份后缀的 sed 流程。",
    "",
    "blockingContract:",
    "  observedFacts: Bash 输入包含 sed --in-place 或未指定备份后缀的裸 sed -i。",
    "  harm: 原地改写难以审查或恢复，并绕过文件感知的编辑 hook。",
    "  unblockWhen: 命令不再执行无备份原地编辑，或改用文件感知编辑工具。",
    "  recovery: 使用 Edit/apply_patch 应用替换；确需 sed 时先建立明确、可恢复的备份。",
  ].join("\n");
}
