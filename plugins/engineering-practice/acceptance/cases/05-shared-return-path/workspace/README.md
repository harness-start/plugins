# Sample conversion contract

`convertSamples()` supports two call forms:

- `convertSamples(rows, offset)` returns an array of converted `[left, right]` rows.
- `convertSamples(left, right, offset)` returns a two-item array of `Float64Array` axes.

Empty inputs preserve the return contract of their call form. Axis inputs must have equal lengths. Invalid call forms and values throw `TypeError` or `RangeError` as appropriate.
