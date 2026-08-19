export function summarizeWindow(samples, width) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  if (!Number.isInteger(width) || width < 1) throw new RangeError("width must be positive");

  const bins = Array.from({ length: width }, () => 0);
  samples.forEach((sample, index) => {
    bins[index % width] += sample;
  });
  return {
    count: samples.length,
    average: samples.reduce((total, sample) => total + sample, 0) / samples.length,
    bins,
  };
}
