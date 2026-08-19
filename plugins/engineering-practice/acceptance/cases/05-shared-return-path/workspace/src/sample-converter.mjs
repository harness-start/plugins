function conversionEngine(rows, offset) {
  if (rows.length === 0) throw new RangeError("the engine requires at least one row");
  return rows.map(([left, right]) => [left + offset, right - offset]);
}

export function convertSamples(...args) {
  if (args.length === 2) {
    const [rows, offset] = args;
    if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row) && row.length === 2)) {
      throw new TypeError("rows must contain two-item arrays");
    }
    if (!Number.isFinite(offset)) throw new TypeError("offset must be finite");
    return conversionEngine(rows.map(([left, right]) => [Number(left), Number(right)]), offset);
  }

  if (args.length === 3) {
    const [left, right, offset] = args;
    if (!Array.isArray(left) || !Array.isArray(right)) throw new TypeError("axes must be arrays");
    if (left.length !== right.length) throw new RangeError("axes must have equal lengths");
    if (!Number.isFinite(offset)) throw new TypeError("offset must be finite");
    const normalized = [Float64Array.from(left), Float64Array.from(right)];
    const rows = Array.from(normalized[0], (value, index) => [value, normalized[1][index]]);
    const converted = conversionEngine(rows, offset);
    return [
      Float64Array.from(converted, (row) => row[0]),
      Float64Array.from(converted, (row) => row[1]),
    ];
  }

  throw new TypeError("expected rows plus offset, or two axes plus offset");
}
