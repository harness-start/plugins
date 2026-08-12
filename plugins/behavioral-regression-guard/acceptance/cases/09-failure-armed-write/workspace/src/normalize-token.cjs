function normalizeToken(value) {
  return String(value).trim().toLowerCase().replaceAll(" ", "-");
}

module.exports = { normalizeToken };
