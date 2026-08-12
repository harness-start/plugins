function transform(...args) {
  const scale = args.at(-1);
  const data = args.slice(0, -1);
  if (data.length === 1) {
    return data[0].map((row) => row.map((value) => value * scale));
  }
  const rowCount = Math.min(...data.map((channel) => channel.length));
  if (rowCount === 0) throw new RangeError("cannot transform zero rows");
  return data.map((channel) => channel.map((value) => value * scale));
}

module.exports = { transform };
