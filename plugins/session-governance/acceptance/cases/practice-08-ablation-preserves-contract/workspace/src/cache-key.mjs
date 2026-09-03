function normalizeSeparators(value) {
  return value.replaceAll("\\", "/");
}

function normalizeForPlatform(platform, value) {
  const normalized = normalizeSeparators(value);
  if (platform === "win32") return normalized.toLowerCase();
  return normalized;
}

export function normalizeCacheKey(platform, value) {
  return normalizeForPlatform(platform, value);
}
