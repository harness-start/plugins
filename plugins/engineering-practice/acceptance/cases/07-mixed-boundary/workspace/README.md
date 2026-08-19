# Channel mapping contract

`mapChannels(left, right, offset)` returns a two-item array of `Float64Array` channels. For nonempty inputs, a one-item channel is repeated to align with the other channel before mapping.

If either input channel is empty, mapping is skipped and each normalized input component is returned unchanged. In particular, an empty channel must not erase or repeat values in its populated sibling. Invalid lengths and values still throw their documented errors.
