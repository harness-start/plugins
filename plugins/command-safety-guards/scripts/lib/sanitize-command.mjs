/**
 * Strip payloads that often embed guard keywords as documentation or
 * commit-message text, so declarative rules do not false-positive.
 */
export function sanitizeCommand(command) {
  if (typeof command !== "string" || !command) return "";
  let stripped = command.replace(
    /\$\(cat\s+<<'?(\w+)'?\n[\s\S]*?\n\1\s*\)/g,
    " __HEREDOC__ ",
  );
  stripped = stripped.replace(
    /\bgit\s+commit\b[^;|&]*/g,
    (commitCommand) =>
      commitCommand
        .replace(/-m\s+"(?:[^"\\]|\\.)*"/g, '-m "__MSG__"')
        .replace(/-m\s+'[^']*'/g, "-m '__MSG__'"),
  );
  return stripped;
}
