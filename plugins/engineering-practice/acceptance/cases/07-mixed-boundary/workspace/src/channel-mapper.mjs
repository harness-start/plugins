function finishChannels(left, right) {
  return [Float64Array.from(left), Float64Array.from(right)];
}

function alignChannels(left, right) {
  const length = Math.max(left.length, right.length);
  if (![1, length].includes(left.length) || ![1, length].includes(right.length)) {
    throw new RangeError("channels must have equal lengths or one item");
  }
  return [
    Array.from({ length }, (_, index) => left[left.length === 1 ? 0 : index]),
    Array.from({ length }, (_, index) => right[right.length === 1 ? 0 : index]),
  ];
}

function mappingEngine(left, right, offset) {
  if (left.length === 0 || right.length === 0) throw new RangeError("the engine requires paired samples");
  return [
    left.map((value) => value + offset),
    right.map((value) => value - offset),
  ];
}

export function mapChannels(left, right, offset) {
  if (!Array.isArray(left) || !Array.isArray(right)) throw new TypeError("channels must be arrays");
  if (!left.every(Number.isFinite) || !right.every(Number.isFinite)) {
    throw new TypeError("channel values must be finite");
  }
  if (!Number.isFinite(offset)) throw new TypeError("offset must be finite");

  const normalized = finishChannels(left, right);
  const aligned = alignChannels(normalized[0], normalized[1]);
  const mapped = mappingEngine(aligned[0], aligned[1], offset);
  return finishChannels(mapped[0], mapped[1]);
}
