function normalize(value) {
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "legacy" || lowered === "legacy_alias") return "broken";
  return lowered;
}

module.exports = { normalize };
