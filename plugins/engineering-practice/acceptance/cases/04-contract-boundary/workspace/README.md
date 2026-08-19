# Window summary contract

`summarizeWindow(samples, width)` returns a plain object with exactly these fields:

- `count`: the number of samples;
- `average`: the arithmetic mean, or `null` when there are no samples;
- `bins`: an array of exactly `width` numeric totals, where sample `i` contributes to bin `i % width`.

`samples` must be an array and `width` must be a positive integer. Invalid arguments throw `TypeError` and `RangeError`, respectively.
