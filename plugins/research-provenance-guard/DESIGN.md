# Research Provenance Guard design

## Contract

For an explicitly activated research task, completion is allowed only when every final claim is represented in a server-generated manifest/report and the final response references a fresh, same-session MCP seal whose artifact hashes still match.

## Causal chain

```text
explicit activation
  -> MCP roots/list workspace binding
  -> candidate discovery (non-evidence)
  -> bounded source capture in private plugin data
  -> exact captured-content anchors
  -> typed claim validation
  -> canonical manifest + report
  -> observed research_seal receipt at epoch/revision
  -> offline Stop revalidation of trailer + files + digest
```

Hook activation or extra turns alone are not outcome evidence. The outcome-level checks are anchor resolution, cross-source status rules, canonical artifact generation, artifact hash recomputation, receipt matching, and freshness after the last observed mutation.

## State and concurrency

The MCP server writes one immutable atomic JSON event file per run event. Hook state is reconstructed from one atomic event file per hook observation, avoiding a shared read-modify-write state file. Hook events expire after 24 hours. A server process permits one unfinished run and is scoped to one workspace root.

The parent session owns completion. Subagents may use the same MCP run to capture or anchor sources, but their prose cannot create a seal receipt; the final Stop check uses the parent host's event stream and final trailer.

## Trust boundaries

- MCP `roots/list` is authoritative for workspace scope; tool arguments cannot select an arbitrary root.
- Direct HTTP pins each request to a DNS result that was checked public and repeats validation for each redirect.
- `.research/` is generated only by `research_seal`; active hooks block direct agent writes.
- Hosted WebSearch and Firecrawl discovery are candidate generators only.
- The digest detects accidental or agent-level fabrication within the observable hook/MCP workflow. It is not a signature, sandbox, or defense against a hostile process with the user's filesystem permissions.

## Degradation

Missing Firecrawl affects discovery only. Missing platform plugin data or MCP roots fails the authoritative path closed. If no evidence can be obtained, a claim may be `unverified` only with a visible limitation; unsupported factual prose outside the canonical report is outside the hard-mode contract and must not be presented as verified.
