function mapChannels(left, right) {
  if (left.length === 0 || right.length === 0) return [[], []];
  return [left.map((value) => value * 2), right.map((value) => value * 3)];
}

module.exports = { mapChannels };
