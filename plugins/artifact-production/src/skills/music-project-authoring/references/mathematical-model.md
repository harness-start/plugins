# Mathematical model

## Representation

Use PPQ 960. An event is `(startTick, durationTick, midi, velocity, voice)` with integer ticks, MIDI in `[0,127]`, and velocity in `[0,127]`. Convert ticks to seconds only at the renderer boundary:

`seconds = ticks / PPQ × 60 / BPM`

For meter `n/d`, one bar contains `PPQ × n × 4/d` ticks. v1 keeps BPM and meter constant.

Map a scale degree `k` to MIDI with modular arithmetic over the selected major or natural-minor interval vector. The octave contribution is `floor(k/7) × 12`. Use Tonal in project authoring when parsing or naming richer pitch/chord material; keep emitted score pitches canonical as MIDI integers.

## Candidate search

Generate between 2 and 8 deterministic candidates from motif rotations and a terminal reversal. Candidate identity is SHA-256 over seed, profile, variant index, and emitted tracks. Reject candidates with hard violations before ranking.

For profile weights `w_i` and normalized metrics `m_i ∈ [0,1]`, compute:

`J = Σ w_i m_i`, where `Σ w_i = 1`.

Rank descending by `J`, then ascending by candidate digest. Never use wall-clock time or unseeded randomness.

Current metric dimensions are harmonic coherence, voice leading, rhythmic fit, motif coherence, structural arc, register separation, and controlled novelty. Profiles alter weights, not hard constraints.

## Euclidean rhythm

For `p` pulses over `s` steps, emit a pulse at step `i` when:

`floor(i × p/s) ≠ floor((i-1) × p/s)`

This evenly distributes pulses. It is a rhythm construction option, not a universal improvement.

## Limits of the model

The score captures declared proxies, not listener response. It does not model timbral fatigue, cultural meaning, performance nuance, emotional fit, or mastering quality. Treat listening review as an independent outcome check, not another model score.
