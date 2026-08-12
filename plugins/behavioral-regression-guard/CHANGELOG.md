# Changelog

## 0.18.1

- Add a fail-closed `coupled-boundary` interaction model for representation seams whose components can degenerate only together. It retains all-populated/all-degenerate coverage, binds every frozen component through one direct real-seam invocation to one structured result witness, rejects partial-peer claims and rebinding, and gives independent review a machine-checkable expected-versus-contrast card instead of inventing invalid asymmetric inputs.
- Keep the exhausted post-failure diagnostic budget fail-closed for unrelated shell exploration while permitting one direct execution of an existing proof under `.behavioral-regression/BR-<id>/`. Chained commands, redirects, inline-code flags, runtime hijacking, and non-managed probes remain denied; the armed probe also freezes candidate production bytes so a proof cannot redefine the baseline before contract activation. This removes the pre-contract proof-ordering deadlock without reopening general diagnostics.
- Recognize explicit behavioral warning messages such as an `opposite order` warning even when the program prints only the warning text and omits its exception-class name. Ad-hoc language runtimes now stage the workspace snapshot before execution, so a successful warning-producing command cannot edit production before the failure gate is armed.
- Escalate repeated post-budget denials with stateful recovery: report that the prior shell command did not execute, stop recommending optional search tools, and require the next action to be a managed proof/contract write (`Write`/`Edit` on Claude, `apply_patch` on Codex) before another shell attempt. The terminal state now observes non-shell tools too and mechanically rejects reads, agents, ordinary test writes, and unrelated actions while preserving the required `$behavioral-regression` Skill and one direct managed-proof run. Every inert terminal attempt increments the same recovery counter: denial three returns a copyable platform-specific tool card, while denial five and later add a machine-readable blocking contract instead of repeating static advice.
- Keep diagnostic counts, reminders, recovery-denial counts, and the original workspace snapshot monotonic when a later command reproduces the same failure in a different way. Repeated warning probes can enrich the observation but can no longer reset the budget and postpone contract binding indefinitely.
- Make `scope.supersededAssertions` mandatory for v11, require every independent chain to contain at least two distinct nodes (with one chain of at least three), and require every custom witness call to have a matching definition in the frozen proof. These checks reject an unsatisfiable old-test/layered-oracle contract, non-discriminating singleton chains, and AFTER-only witness typos before receipts freeze.
- Put reviewer nonce and exact `evidencePaths` at the start of the SubagentStart context, before the long task and contract projection, so hosts that persist large hook output still expose every allowed anchor in their short inline preview.
- Represent machine-checkable reviewer outputs with `null` placeholders and require raw JSON results with the same shape and type as the derived outcome. Recovery messages reject prose-wrapped arrays without leaking the answer, while an oracle reviewer may record a structured `contract-conflicts` challenge instead of being forced to echo the frozen contract oracle.
- Give machine reviewer cards an answer-free canonical `representationGrammar` when their outcome includes a representation descriptor, so independently derived source-language container names, nesting, and lengths converge without revealing the hidden descriptor or accepting semantically equivalent prose as the same machine value. The validator checks descriptor/value cardinality, and coupled-boundary contrasts use their public value shape plus this grammar instead of an unknowable author-selected label.
- Publish separate answer-free `valueShape`, `contrastValueShape`, and patch-stage `observedValueShape` fields, preventing recovery from applying an error/null contrast shape to the independently derived oracle or observed implementation result.
- Make bounded reviewer navigation executable on hosts without a Grep tool: require `Read` for every declared evidence path, direct long-file continuation through `offset`/`limit`, and explicitly forbid simulating unavailable Grep with Bash. Denied reviewer tools repeat that same recovery path instead of advertising a missing capability.
- Reject `coupled-boundary` scope narrowing unless the original task explicitly says components must degenerate together or partial-degenerate inputs are invalid. A joint-empty example no longer suppresses the component matrix; unsupported coupling claims must add each-one-degenerate cases that preserve populated peers.
- Make exhausted-probe recovery state-aware after contract authoring: when an existing v11 contract is invalid, repeat its concrete findings and direct the next `Edit`/`Write` to that contract or its existing bundle instead of incorrectly asking for a second bundle.
- Include the canonical source declaration in a mismatched `signatureLocator` finding and explicitly tell Python authors to omit the trailing colon, preventing a formatting mismatch from being misdiagnosed as a fixed-to-variadic evolution failure.
- Preserve `oraclePolicy` and `contrastPolicy` names in reviewer recovery cards and define the stable-layer calculation without revealing its output: freeze and emit the complete current ready layer before admitting newly unlocked nodes. This lets a bounded reviewer derive raw ordering arrays instead of guessing between chain-contiguous and eager orders.
- Treat v11 `scope.supersededAssertions` as oracle-bound metadata rather than permission to mutate project tests. The declared baseline assertion remains the independently inspectable contrast, the managed bundle supplies RED, and every regression path must stay byte-identical to Git baseline; even an exact candidate-side before/after replacement is denied so evaluator-owned test patches cannot be shadowed or copied into the delivery patch.
- Diagnose a managed proof command wrapped only in a trailing `; echo ...` status observer as a command-shape error and return the exact direct invocation to run. The wrapper remains denied, but recovery no longer misdirects the agent into rewriting a correct bundle.
- Bind every v11 cycle diagnostic to one opaque zero-argument seam thunk and a declared identity projection. Python warning records must return `str(item.message)` from the surrounding `warnings.catch_warnings(record=True)` source; JavaScript structured seams must return an unmodified string projection of the same call's `diagnostics` field. Contributor-aware synthesis, filtering, formatting, mutation, multiple returns, and hardcoded warning payloads are rejected before receipts freeze.
- Return the exact canonical Python mapping shape when a warning projection is structurally invalid, so recovery converges on the statically verified return instead of repeatedly trying equivalent object wrappers.
- Accept direct bracket-field access in v11 scenario witnesses, matching the canonical Python observation mapping while retaining exact field and binding checks.
- Add answer-free `valueShape` hints to machine reviewer cards and mismatch findings, allowing cycle outcomes with `{order, diagnostics}` to converge without exposing either hidden value.
- Clarify oracle-review disposition at both dispatch and recovery: `contract-conforms` compares an independent derivation with the contract oracle, not with the intentionally defective baseline implementation. When a reviewer submits the contract oracle but labels it `contract-conflicts`, the hook now directs that single field correction without revealing any value.
- Remove the non-derivable exact cycle-warning string from the answer-hidden independent-review pack. Cycle behavior remains stricter at the machine layer—source-bound identity projection plus exact runtime contributor/order/diagnostic equality—while reviewers continue to challenge the independently derivable ordering policy, supersession, composition, and representation claims.
- Permit one exact, non-recursive rollback command when contract activation proves that an undeclared managed proof file or Python cache file was created after the armed failure snapshot. Every target must have been absent at arm time and remain an untracked regular file or symlink; declared proof assets, tracked files, directories, and unrelated deletion commands stay denied, and successful cleanup restores the original bind path instead of forcing contract laundering.
- Allow non-ordering v11 contracts to declare `scope.supersededAssertions: []`, while retaining the non-empty oracle-bound requirement for ordering semantics. A representation or boundary repair with no intentionally replaced Git-baseline expectation no longer has to invent unrelated test metadata.

## 0.18.0

- Add `behavioral-regression/v11` with an oracle-bound `scope.supersededAssertions` seam for exact expected-literal supersession metadata; inputs, before/after values, assertion text, target scenario, Git-baseline identity, and one-to-one declaration identity are all checked, while candidate test edits, tautologies, call rewrites, and collapsed targets remain forbidden.
- Require lifecycle reviewers to return one structured `challengeResults` entry per hook-issued challenge. Ordering and declared-supersession inputs, stable-layer outputs, and eager/baseline alternatives are recomputed by the hook; oracle prompts no longer reveal those outputs.
- Preserve every hook-frozen challenge input in independent-review recovery cards while continuing to hide oracle/contrast outputs, and accept `BR_REVIEW_RESULT` only as one unique final non-empty line.
- Compare project-test text directly with the Git baseline instead of trusting configurable diff drivers, so `--`/`++` lines, binary/no-hunk output, arbitrary insertions, and undeclared edits cannot hide a regression change.
- Bind each superseded value to a declared top-level expected operand (`call` or parameter `sequence`) in addition to its ordered scenario inputs. Call assertions must invoke the real seam from a non-expected operand; parameter rows must name an unchanged real-seam consumer, preventing a seam argument from masquerading as expected data.
- Require qualitative review challenges to name normalized 12..1000-character input, expectation, and distinct `rejectedAlternative` values; padded recovery placeholders and whitespace-only contrasts are rejected.
- Tell an agent trapped in an invalid contract state that denied shell mutation did not execute and that recovery must use a direct Edit or Write on the contract, eliminating repeated no-op heredoc rewrites.

## 0.17.0

- Add a causal `homogeneous-neutrality` evidence path for true variadic aggregates: the frozen proof and runtime must establish `F(P) == F(E, P) == F(P, E)` on the real seam, avoiding invented component slots while preserving asymmetric matrices for distinct axes/channels.
- Require every call form of one callable to declare the same target variadic signature during `extend-existing-seam`, preventing a contract that is valid only before or only after the planned signature change.
- Make shell mutation classification quote-aware and ignore framework setup failures without explicit behavioral evidence, eliminating false gates from strings such as `a -> b` and unconfigured framework settings.
- Diagnose failed AFTER scenario witnesses with their marker plus concrete actual/expected outcomes, and stop recommending pause/abort after production has changed.
- Freeze proof and regression assets at PreToolUse after the first BEFORE receipt, preventing a late edit from silently invalidating an otherwise-complete evidence round.
- Treat genuine-cycle diagnostics as a presence obligation in the ordering witness while leaving exact warning text to compatibility assertions, and reuse a still-current independent-review approval instead of dispatching redundant reviewers.
- Re-emit one throttled behavioral-skill recommendation after three post-failure diagnostic commands and pause further shell exploration after six, with an explicit `.behavioral-regression/<id>/` proof recovery path, so an armed probe cannot be forgotten during an unbounded read-only loop without turning SessionStart or every command into a prompt wall.
- Preserve an armed failure after rejected contract authoring, print the hook-derived stable-layer order in ordering findings, and enforce an original task's explicit no-network constraint against shell download clients and Claude WebSearch/WebFetch so future released implementations cannot contaminate the frozen oracle.
- Publish the independent-review counterexample size contract (`12..1000` characters) before dispatch and diagnose missing, short, oversized, or mistyped entries separately instead of misreporting every malformed card as a missing falsification attempt.
- Include concrete actual and expected JSON in every homogeneous-neutrality witness mismatch, so a sample-envelope error can be repaired from one failed AFTER command instead of repeated blind executions.
- Make lifecycle-bound review evidence causal: a reviewer may use only Read/Grep on exact hook-declared evidence paths, must actually inspect every one, and must echo the complete observed anchor set before an oracle or patch approval receipt can be issued.
- Split reviewer guidance by stage: oracle review derives from baseline files, while patch review must inspect current production plus every declared project-test file and account for observed suite failures.
- Keep closed-contract verification and project regression paths frozen at PreToolUse, preventing a late test edit from first revoking all receipts and only then failing at Stop.
- Fail closed when a high-risk open contract spawns a subagent without a successful lifecycle reservation: inject an immediate-return protocol and deny every child tool, so a premature `BR_REVIEW_REQUEST` cannot degrade into a writable implementer that authors its own proof receipts.

## 0.16.0

- For contracts whose claims explicitly describe an empty or zero-sized input-container boundary, require every canonical all-degenerate component sample to be structurally empty and every preserved peer to contain a real populated value; one-element placeholders and hollow shapes such as `[[], []]` can no longer obtain receipts for a different input family.
- Permit an `extend-existing-seam` contract's frozen baseline signature locator to survive the declared fixed-to-variadic evolution, but only when Git confirms one matching fixed baseline declaration and the current source has one variadic declaration at the same nesting level; preserve-existing contracts still reject the change.
- Require preserved-peer relations to observe one complete output component directly; nested metadata such as `.shape`, `.ndim`, or `.length` can no longer approve an aggregate-empty implementation while still allowing legitimate non-identity mappings such as `[2]` to `[6]`.
- Route shell tools through the pre-execution proof gate and reject explicit inline file writers while BEFORE evidence is incomplete, closing the parent-shell escape that remained after a file-tool edit was denied.
- Ignore descriptor-only redirection to `/dev/null` or another file descriptor when classifying shell mutation intent, so read-only diagnostic commands do not consume the evidence loop while real file redirection remains gated.
- Keep lifecycle-bound reviewers inside a bounded local review: forbid research/MCP, nested agents, skills, shell, and writes while allowing declared Read/Grep/Glob anchors, preventing an oracle check from opening a second provenance workflow.

## 0.15.0

- Require each `signatureLocator` to name the same callable as its seam locator, then resolve its complete production-source signature before trusting `variadic`; neither a truncated locator nor a fixed-arity nested helper can disguise `*args` or `...args` as one conceptual input and bypass asymmetric peer-preservation evidence.
- Require every contributor in the independent pair/chain ordering discriminators to be duplicate-free, preventing repeated-node pseudo chains from collapsing stable-layer and eager algorithms to the same output.
- Bind independent-review receipts to every hook-issued challenge-pack id in addition to semantic dimensions, so a generic counterexample sentence cannot approve an ordering, representation, composition, or concurrency review without addressing its concrete discriminators.
- Report original-task semantic omissions alongside structural contract findings during the first rejected activation, avoiding a second authoring round after the model repairs only the schema details.
- Tell oracle reviewers that a known baseline defect is expected and is not itself a challenge; reserve challenges for an incorrect target, oracle, invariant, scope, or causal obligation.
- Require reviewers to treat a baseline assertion that encodes the task's exact behavior change as a supersession candidate rather than automatically promoting it to a preserved invariant.
- Keep declared production paths write-protected after a baseline contract is paused or aborted; those statuses release `Stop`, not the causal edit gate, and continuing the repair requires reopening the next epoch.

## 0.14.0

- Derive mandatory semantics from case dimensions, coverage, and oracle assertions as well as top-level claims, preventing ordering obligations from being hidden inside a composition case.
- Require every v10 variadic representation seam to prove asymmetric concrete argument positions, so a single rest-parameter label cannot suppress partial-degeneracy relations.
- Freeze the original parent task from the contract-activation transcript and give reviewers the task, candidate cases, and hook-derived challenge pack instead of trusting the contract framing alone.
- Reject compatibility invariants that state only that a test or suite remains green, and direct reviewers to baseline content rather than tests added during the current repair.

## 0.13.0

- Constrain v10 relational evidence to distinct top-level component arguments, one direct seam invocation, a pure result projection, the exact original source argument, and one runtime witness payload.
- Reject companion-call laundering, boolean fallbacks, component rebinding, and result reassignment or mutation between invocation and witness.
- Add lifecycle-bound oracle and patch subagent reviews for high-risk Claude contracts; bind approvals to the frozen plan and fingerprints and require different reviewers.
- Keep Codex review advisory until its host exposes the complete dispatch/start/stop chain, and stop treating ordinary `SubagentStop` as parent workflow completion.

## 0.12.0

- Add `behavioral-regression/v10`, deriving mandatory ordering and representation semantics from the contract's own behavioral claims so authors cannot bypass structured oracles by omitting a trait.
- Require generalized mergers to exercise public zero/one/two/many behavior, and state the non-zero exit requirement for failure BEFORE bundles.
- Bind relational witnesses to the exact component-bearing seam invocation and its unreassigned result, preventing a separate populated call from laundering partial-input evidence.
- Require exact binary independent-chain ordering in addition to the multi-chain atomic-layer discriminator.
- Treat return/produce/yield container claims as representation semantics, and prevent paused or aborted contracts from releasing a changed production tree.
- Keep homogeneous variadic contributor collections out of the asymmetric component matrix unless a real split-data call form exists.

## 0.11.0

- Bind every call form to an exact signature in a declared production source file, and reject fixed-shape descriptions of source-level variadic data.
- Extend asymmetric component evidence to variadic representation seams, using two concrete argument slots so a populated peer cannot disappear behind an aggregate empty result.
- Derive stable topological layer order independently from contributor sequences and require cycle diagnostics to retain the original contributor context.
- Freeze tracked, production-adjacent regression tests alongside isolated probes; additive RED cases remain allowed, while deleting or rewriting baseline assertions is rejected.
- Reduce SessionStart guidance to a quiet capability index entry.
- Bind ordering witnesses to a direct invocation of the declared constraint seam, so an invented helper cannot satisfy an otherwise-correct oracle.
- Default non-semantic empty v9 fields and recover a declared command's exit status from a trailing diagnostic echo, reducing contract-authoring retries without weakening evidence.
- Treat two disjoint chains as a complete wave-order challenge and detect duplicates across contributor boundaries, matching the observable ordering semantics instead of requiring artificial self-duplicates.
- Permit packed and split call forms on the same variadic representation seam, accept semantic names as supplementary coverage labels, and diagnose each missing asymmetric relation as a distinct case.

## 0.10.0

- Upgrade new contracts to `behavioral-regression/v8` with a frozen component-sample matrix: each partial-degeneracy case must reuse the exact all-degenerate sample for the component under test.
- Bind relation witnesses to the complete component matrix, preventing an empty boundary from being relabeled as a different minimum-sized input.
- Require ordering repairs to prove five structurally checked scenarios (`independent-chains`, `shared-prefix`, `shared-suffix`, `duplicates`, and `genuine-cycle`) with runtime contributor/outcome witnesses.
- Keep that evidence operationally compact: bundle arities and ordering scenarios into the minimum four-case plan, allowing one direct command to issue multiple matching receipts.

## 0.9.0

- Upgrade new contracts to `behavioral-regression/v7`, binding each preserved peer to non-degenerate source and expected-target samples.
- Require a direct witness locator in the frozen proof file and a matching structured runtime witness before an AFTER receipt can be issued.
- Reject marker-only and preprocessed-source relation evidence so aggregate empty results cannot masquerade as peer preservation.
- Bind the constraint locator to a declared production source file; three-or-more composition must identify a pre-existing callable operation, preventing a consumer property or prospective helper from self-certifying as the constraint seam.

## 0.8.0

- Add `behavioral-regression/v6` identity relations for every peer claimed as preserved by a partial-degeneracy case.
- Require each relation's marker in AFTER evidence, tying the receipt to a direct value-and-representation comparison instead of an aggregate empty or shape-only assertion.
- Treat nested `.behavioral-regression/<id>/...` files as proof assets before contract binding, eliminating the failure-probe bootstrap deadlock.

## 0.7.0

- Add `behavioral-regression/v5` call-form enumeration and derive input shape from independently mutable data components rather than free-form classification.
- Isolate executable proof paths below the bound contract directory so project test discovery cannot import or execute probe scripts.
- Require verification assets and formal regression tests to be collection-safe before the first frozen receipt.
- Keep relational component binding structural; oracle prose no longer has to duplicate exact component labels.

## 0.6.0

- Add `behavioral-regression/v4` evidence binding while retaining v3 loading compatibility.
- Bind seam coverage to concrete proof files and source-level invocation locators.
- Require direct many-arity RED-to-GREEN evidence at the existing constraint seam for three-or-more composition repairs.
- Require component-by-component relational oracles for partial degeneracy instead of accepting aggregate coverage labels.
- Reduce the SessionStart route to one unheaded sentence.

## 0.5.0

- Upgrade contracts to `behavioral-regression/v3` and bind both the observable public seam and the pre-existing constraint-forming seam.
- Require zero/one/two/many primitive coverage whenever a defect emerges only after three or more compositions.
- Recognize caught `*Error` exception classes as observable probe failures even when a diagnostic wrapper exits successfully.
- Make the compact SessionStart route imperative while retaining a single-line protocol and no `UserPromptSubmit` hook.

## 0.4.0

- Upgrade contracts to `behavioral-regression/v2` with an explicit public seam, input shape, semantic traits, and compatibility obligations.
- Require a complete multi-component interaction matrix or variadic 0/1/2/many arity matrix as applicable.
- Require ordering, representation, error, state, composition, and concurrency counterexample coverage from declared surface semantics.
- Bind the structured surface and coverage matrix into the immutable plan digest.

## 0.3.0

- Replace the verbose SessionStart route with a one-line protocol and keep `UserPromptSubmit` unused.
- Arm a scoped file-write gate only after observable test or reproduction failure evidence.
- Permit proof assets while armed, require every signed BEFORE receipt before production edits, and release stale candidates after clean replay, pause, abort, or TTL expiry.
- Add public-seam coverage for candidate arming, fail-open environment outcomes, proof-path access, and BEFORE-gated production release.

## 0.2.0

- Publish a compact SessionStart capability route even before a contract exists, while keeping hard activation bound to an explicit contract mutation.
- Add interaction-matrix guidance for partial multi-component inputs and wave-sensitive ordering guidance for independent chains.
- Add dual-host auto-route acceptance for partial degeneracy and ready-wave ordering without task-specific hints.

## 0.1.0

- Add explicit behavioral regression contracts, signed BEFORE/AFTER receipts, fingerprint freshness, lifecycle leases, dual-host hooks, and the `behavioral-regression` Skill.
- Label Codex unified-exec evidence as `literal-oracle` when the host omits exit status instead of overstating the observation strength.
