# Artifact Evidence Guard

Validates an explicit `artifact-evidence/v1` block in a final response against files in the current workspace. It checks path containment, regular-file identity, byte count, SHA-256 digest, and a bounded format signature.

No evidence block is a no-op. Once a block is present, malformed, mismatched, unsafe, oversized, or otherwise unverifiable evidence blocks `Stop`.

```artifact-evidence
{"schema":"artifact-evidence/v1","artifacts":[{"path":"dist/manual.pdf","bytes":1234,"sha256":"<64 lowercase hex characters>","format":"pdf"}]}
```

Supported formats are `text`, `json`, `pdf`, `png`, `jpeg`, `svg`, `zip`, and `binary`. `binary` checks identity, size, and digest but makes no native-format claim.

Run the offline tests from the marketplace root:

```bash
node --test plugins/artifact-evidence-guard/tests/*.test.mjs
```

The plugin establishes materialization evidence only. It does not prove design quality, factual accuracy, accessibility, or publication readiness.
