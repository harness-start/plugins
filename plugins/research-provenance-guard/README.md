# Research Provenance Guard

An opt-in hard research harness for Claude Code and Codex. It turns sources into captured receipts, exact anchors, typed claims, canonical reports, and a fresh completion seal instead of relying on model-written citations.

## Activation

Hard mode activates only through `/research`, `$research`, the bundled `research-evidence-workflow` Skill, or the first `research_begin` MCP call. Ordinary answers bypass the gate. The user can abandon an active run only with `# research-abort`.

## Evidence path

`research_begin` binds one run to the single workspace root advertised by the MCP client. `source_discover` may use an installed Firecrawl CLI, but discovery is never evidence. `source_capture`, `source_read`, and `source_anchor` build evidence; `research_seal` validates claims and writes:

```text
.research/runs/<run-id>/research.json
.research/runs/<run-id>/report.md
```

The final answer must contain only an optional pointer to the matching canonical report plus the exact trailer returned by `research_seal`:

```text
Research-Evidence: research-evidence/v1
Research-Run: <run-id>
Research-Seal: sha256:<digest>
```

The Stop hook works offline. It requires an observed MCP seal receipt from the current prompt epoch and mutation revision, then recomputes the manifest payload, report, and seal digests. Any later observed mutation or artifact tampering invalidates completion.

## Source safety and privacy

- Workspace captures must remain under the bound root and be regular UTF-8 text files at most 8 MiB.
- Direct URL capture accepts public HTTP(S) text, HTML, JSON, and XML only; it rejects URL credentials, sensitive query keys, private/loopback/link-local/metadata addresses on every redirect, login/challenge pages, more than five redirects, responses over 8 MiB, and requests over 15 seconds.
- Firecrawl runs as a fixed-argument child process without a shell, with feedback telemetry disabled. If it is unavailable, known URLs and workspace sources still work.
- Authoritative content, receipts, and append-only events live under the platform plugin data directory with private permissions and a 24-hour hook TTL. Workspace files contain only the generated report and manifest.

Captured web content remains untrusted. The seal is an integrity digest backed by same-session hook observation, not a cryptographic identity signature and not protection against a malicious same-user process that can alter plugin data.

## Community skills

`skill-deps.json` pins Matt Pocock's `research` skill at `v1.2.3` and Firecrawl's CLI skill at `v1.19.30`. They improve discovery and research technique; this plugin's MCP capture and Stop validation establish the enforceable evidence chain.
