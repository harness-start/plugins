/**
 * composer.json / tool-input helpers, ported from the source harness
 * composer-hook-utils module (pure functions, no dependencies).
 */

export function isComposerJson(filePath) {
  if (typeof filePath !== "string") return false;
  return (filePath.split(/[\\/]/).pop() ?? "") === "composer.json";
}

export function multiEditNewStrings(edits) {
  if (!Array.isArray(edits)) return [];
  return edits.flatMap((edit) => {
    if (!edit || typeof edit !== "object" || !("new_string" in edit)) return [];
    const value = edit.new_string;
    return typeof value === "string" ? [value] : [];
  });
}

export function stringInput(value) {
  return typeof value === "string" ? value : "";
}
