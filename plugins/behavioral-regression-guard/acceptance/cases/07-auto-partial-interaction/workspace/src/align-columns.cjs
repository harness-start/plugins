function alignColumns(left, right) {
  const width = Math.min(left.length, right.length);
  return {
    left: left.slice(0, width),
    right: right.slice(0, width),
  };
}

module.exports = { alignColumns };
