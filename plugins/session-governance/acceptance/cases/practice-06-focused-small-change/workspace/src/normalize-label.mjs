export function normalizeLabel(value) {
  const normalized = String(value).trim();
  return normalized || "(empty)";
}
