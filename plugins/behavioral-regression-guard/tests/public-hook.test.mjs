import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { coupledBoundaryContract, homogeneousNeutralityContract, regressionContract, sourceBoundVariadicContract, witnessedOrderingContract, witnessedRelationContract } from "./fixtures.mjs";
import { commandObservation, hasShellMutationIntent } from "../scripts/lib/hook-io.mjs";
import { isManagedProofCommand } from "../scripts/lib/probe-gate.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/behavioral-regression-guard.mjs", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-public-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const directory of [".behavioral-regression", "src", "test"]) mkdirSync(join(root, directory));
  writeFileSync(join(root, "src", "normalize.js"), "bug\n");
  for (const name of ["primary", "boundary", "representation", "compat"]) writeFileSync(join(root, "test", `${name}.mjs`), `// ${name}\n`);
  const path = join(root, ".behavioral-regression", "BR-20260809-normalize.json");
  writeFileSync(path, `${JSON.stringify(regressionContract(), null, 2)}\n`);
  return { root, data, path };
}

function emptyFixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-public-empty-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-empty-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, data };
}

function relationFixture(contract = witnessedRelationContract()) {
  const root = mkdtempSync(join(tmpdir(), "behavioral-public-relation-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-relation-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const proofRoot = join(root, ".behavioral-regression", contract.id);
  mkdirSync(proofRoot, { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\nmodule.exports = { mapChannels };\n");
  for (const item of contract.cases) {
    const locators = [
      "mapChannels(",
      ...(item.oracle.relations ?? []).map((relation) => relation.witnessLocator),
      ...(item.oracle.scenarios ?? []).map((scenario) => scenario.witnessLocator),
    ];
    writeFileSync(join(root, item.proofPath), `${locators.join("\n")}\n`);
  }
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
  return { root, data, path, contract };
}

function v11OrderingFixture() {
  const contract = homogeneousNeutralityContract();
  contract.schema = "behavioral-regression/v11";
  contract.surface.semantics.push("ordering");
  contract.surface.orderingPolicy = "stable-topological-layers";
  for (const form of contract.surface.callForms) form.signatureLocator = "function mapChannels(left, right)";
  const orderingCase = contract.cases[2];
  orderingCase.oracle.scenarios = [
    ["independent-pair", [[1, 2], [3, 4]], [1, 3, 2, 4], "BR_SCENARIO_INDEPENDENT_PAIR", "pair"],
    ["independent-chains", [[1, 2, 7], [3, 4], [5, 6]], [1, 3, 5, 2, 4, 6, 7], "BR_SCENARIO_INDEPENDENT_CHAINS", "chains"],
    ["shared-prefix", [[1, 2], [1, 3]], [1, 2, 3], "BR_SCENARIO_SHARED_PREFIX", "prefix"],
    ["shared-suffix", [[1, 3], [2, 3]], [1, 2, 3], "BR_SCENARIO_SHARED_SUFFIX", "suffix"],
    ["duplicates", [[1, 2, 2], [1, 2]], [1, 2], "BR_SCENARIO_DUPLICATES", "duplicates"],
    ["genuine-cycle", [[1, 2], [2, 1]], [1, 2], "BR_SCENARIO_CYCLE", "cycle"],
  ].map(([kind, contributors, order, marker, variable]) => ({
    kind,
    contributors,
    expected: { order, diagnostics: kind === "genuine-cycle" ? ["conflict: [1,2] [2,1]"] : [] },
    marker,
    contributorsBinding: `${variable}Contributors`,
    observationBinding: `${variable}Observation`,
    ...(kind === "genuine-cycle" ? {
      diagnosticProjection: { sourceKind: "seam-result-field", sourceBinding: "rawObservation", valueSelector: "self" },
    } : {}),
    invocationLocator: `${variable}Observation = observeScenario(() => mapChannels(...${variable}Contributors))`,
    witnessLocator: `emitScenarioWitness("${marker}", ${variable}Contributors, ${variable}Observation.order, ${variable}Observation.diagnostics)`,
  }));
  orderingCase.coverage.push("independent-order", "shared-order", "conflict-order");
  orderingCase.after.includes.push(...orderingCase.oracle.scenarios.map((scenario) => scenario.marker));
  const before = "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1, 2, 3, 4]);";
  contract.scope.supersededAssertions = [{
    path: "test/channel-map.test.cjs",
    beforeAssertion: before,
    afterAssertion: "assert.deepEqual(mapChannels([1, 2], [3, 4]), [1, 3, 2, 4]);",
    beforeExpectedLiteral: "[1, 2, 3, 4]",
    afterExpectedLiteral: "[1, 3, 2, 4]",
    inputLiterals: ["[1, 2]", "[3, 4]"],
    assertionForm: "call",
    expectedOperandIndex: 1,
    valueCodec: "json",
    reason: "stable-topological layers supersede the eager binary expectation",
    targetCaseId: orderingCase.id,
    scenarioMarker: "BR_SCENARIO_INDEPENDENT_PAIR",
  }];

  const root = mkdtempSync(join(tmpdir(), "behavioral-public-v11-ordering-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-v11-ordering-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "behavioral@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Behavioral Fixture"], { cwd: root });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  mkdirSync(join(root, ".behavioral-regression", contract.id), { recursive: true });
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\nmodule.exports = { mapChannels };\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), `${before}\n`);
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture baseline"], { cwd: root });
  const proof = [
    "function emitScenarioWitness(...args) { return args; }",
    "function emitNeutralityWitness(...args) { return args; }",
    "function observeScenario(callback) { const rawObservation = callback(); return { order: rawObservation.order, diagnostics: rawObservation.diagnostics.map((item) => String(item)) }; }",
    "mapChannels(",
    ...contract.cases.flatMap((item) => item.oracle.scenarios ?? []).flatMap((scenario) => [scenario.invocationLocator, scenario.witnessLocator]),
    ...contract.cases.flatMap((item) => item.oracle.neutrality ? [
      item.oracle.neutrality.singleInvocationLocator,
      item.oracle.neutrality.leftInvocationLocator,
      item.oracle.neutrality.rightInvocationLocator,
      item.oracle.neutrality.witnessLocator,
    ] : []),
  ];
  writeFileSync(join(root, contract.cases[0].proofPath), `${proof.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
  return { root, data, path, contract };
}

function sourceBoundFixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-public-source-bound-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-source-bound-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "behavioral@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Behavioral Fixture"], { cwd: root });
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "channel-map.cjs"), "function mapChannels(...channels) { return channels; }\n");
  writeFileSync(join(root, "test", "channel-map.test.cjs"), "let calls = 1;\n--calls;\nmapChannels([], []);\n");
  execFileSync("git", ["add", "src/channel-map.cjs", "test/channel-map.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture baseline"], { cwd: root });
  const contract = sourceBoundVariadicContract();
  mkdirSync(join(root, ".behavioral-regression", contract.id), { recursive: true });
  const proof = [
    "mapChannels(",
    ...contract.cases.flatMap((item) => item.oracle.relations ?? []).map((relation) => relation.witnessLocator),
  ];
  writeFileSync(join(root, contract.cases[0].proofPath), `${proof.join("\n")}\n`);
  const path = join(root, ".behavioral-regression", `${contract.id}.json`);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
  return { root, data, path, contract };
}

function coupledTaskFixture() {
  const fx = sourceBoundFixture();
  const contract = coupledBoundaryContract();
  const primary = contract.cases.find((item) => item.role === "primary");
  writeFileSync(join(fx.root, primary.proofPath), [
    "const emptyLeft = [];",
    "const emptyRight = [];",
    primary.oracle.coupledBoundary.invocationLocator,
    primary.oracle.coupledBoundary.witnessLocator,
  ].join("\n"));
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  return { ...fx, contract };
}

function parseOutput(stdout) {
  const line = String(stdout).trim();
  return line ? JSON.parse(line.split("\n").at(-1)) : null;
}

function runHook(mode, event, env = {}, platform = null) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, ...(platform ? [platform] : [])], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("public hook is idle without activation and blocks Stop after contract activation", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const idle = await runHook("stop", { cwd: fx.root, session_id: "idle" }, env);
  assert.equal(idle.stdout, "");

  const active = await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  assert.match(active.stdout, /Bound BR-20260809-normalize/u);
  const stopped = await runHook("stop", { cwd: fx.root, session_id: "s", last_assistant_message: "done" }, env);
  assert.match(stopped.stdout, /"decision":"block"/u);
  assert.match(stopped.stdout, /BEFORE|open/u);

  writeFileSync(join(fx.root, "src", "normalize.js"), "changed\n");
  const changedStop = await runHook("stop", { cwd: fx.root, session_id: "s", last_assistant_message: "done" }, env);
  assert.doesNotMatch(changedStop.stdout, /pause\/abort it/iu);
  assert.match(changedStop.stdout, /finish the evidence loop|restore the production baseline/iu);
});

test("ordinary SubagentStop is not mistaken for parent workflow completion", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", { cwd: fx.root, session_id: "subagent-parent", tool_name: "Write", tool_input: { file_path: fx.path } }, env, "claude");
  const result = await runHook("subagent-stop", {
    hook_event_name: "SubagentStop",
    cwd: fx.root,
    session_id: "subagent-parent",
    agent_id: "ordinary-reader",
    last_assistant_message: "Read-only review complete.",
  }, env, "claude");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("Claude contract activation cannot omit semantics present in the frozen user task", async () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.cases[0].coverage = [];
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  const transcriptPath = join(fx.root, "claude-parent-transcript.jsonl");
  writeFileSync(transcriptPath, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: { role: "user", content: "Merge independent dependency chains in deterministic order." },
  })}\n`);

  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "task-semantic-binding",
    transcript_path: transcriptPath,
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, { PLUGIN_DATA: fx.data }, "claude");

  assert.match(`${result.stdout}${result.stderr}`, /original user task requires surface\.semantics.*ordering/u);
  assert.match(`${result.stdout}${result.stderr}`, /primary.*coverage|coverage.*primary/u);
});

test("a coupled-boundary contract cannot exclude partial-degenerate peers without original-task evidence", async () => {
  const fx = coupledTaskFixture();
  const transcriptPath = join(fx.root, "claude-coupled-transcript.jsonl");
  writeFileSync(transcriptPath, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: { role: "user", content: "Passing empty lists to the variadic channel mapper should return empty lists instead of failing." },
  })}\n`);
  const rejected = await runHook("post", {
    cwd: fx.root,
    session_id: "coupled-task-unsupported",
    transcript_path: transcriptPath,
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, { PLUGIN_DATA: fx.data }, "claude");
  assert.match(`${rejected.stdout}${rejected.stderr}`, /original user task does not establish.*partial-degenerate.*invalid.*component-matrix.*each-one-degenerate/iu);

  const explicit = coupledTaskFixture();
  const explicitTranscript = join(explicit.root, "claude-coupled-explicit.jsonl");
  writeFileSync(explicitTranscript, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: { role: "user", content: "Both named channels must degenerate together; a partial-degenerate channel pair is invalid and unsupported." },
  })}\n`);
  const accepted = await runHook("post", {
    cwd: explicit.root,
    session_id: "coupled-task-explicit",
    transcript_path: explicitTranscript,
    tool_name: "Write",
    tool_input: { file_path: explicit.path },
  }, { PLUGIN_DATA: explicit.data }, "claude");
  assert.match(accepted.stdout, /Bound BR-/u);
});

test("Claude high-risk production writes require a lifecycle-bound oracle review", async () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.semantics = ["concurrency"];
  contract.cases[1].coverage.push("concurrent-interleaving");
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  const env = { PLUGIN_DATA: fx.data };
  const session = "independent-review";
  const transcriptPath = join(fx.root, "claude-parent-transcript.jsonl");
  writeFileSync(transcriptPath, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: { role: "user", content: "Original task: preserve the populated peer when one variadic input is empty." },
  })}\n`);
  await runHook("post", {
    cwd: fx.root, session_id: session, transcript_path: transcriptPath,
    tool_name: "Write", tool_input: { file_path: fx.path },
  }, env, "claude");

  const unreservedStart = parseOutput((await runHook("review-start", {
    hook_event_name: "SubagentStart", cwd: fx.root, session_id: session,
    agent_id: "unreserved-agent",
  }, env, "claude")).stdout);
  assert.match(unreservedStart?.hookSpecificOutput?.additionalContext ?? "", /no bound review reservation.*return without/iu);
  const unreservedRead = parseOutput((await runHook("review-pre", {
    cwd: fx.root, session_id: session, agent_id: "unreserved-agent",
    tool_name: "Read", tool_input: { file_path: join(fx.root, "src", "normalize.js") },
  }, env, "claude")).stdout);
  assert.equal(unreservedRead?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(unreservedRead?.hookSpecificOutput?.permissionDecisionReason ?? "", /no bound review reservation/iu);

  for (const [index, [command, outcome, output]] of [
    ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
    ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
    ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
    ["node test/compat.mjs", "success", "COMPAT_OK"],
  ].entries()) {
    const observed = await runHook(outcome === "failure" ? "failure" : "post", {
      cwd: fx.root, session_id: session, tool_name: "Bash",
      tool_input: { command }, tool_response: { exit_code: outcome === "failure" ? 1 : 0, output },
    }, env, "claude");
    contract.cases[index].receipts.before = observed.stdout.match(/BR-R[0-9]+/u)?.[0] ?? null;
  }
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env, "claude");

  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: session, tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env, "claude")).stdout);
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /oracle reviewer|independent review/iu);

  const prompt = `BR_REVIEW_REQUEST ${contract.id} oracle`;
  const childTranscriptPath = join(fx.root, "claude-child-transcript.jsonl");
  writeFileSync(childTranscriptPath, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: { role: "user", content: prompt },
  })}\n`);
  const reservation = await runHook("review-pre", {
    cwd: fx.root, session_id: session, tool_name: "Agent", tool_use_id: "tool-review-1",
    tool_input: { prompt },
  }, env, "claude");
  assert.equal(reservation.stdout, "", reservation.stderr);
  const unstructured = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent", last_assistant_message: "The oracle looks correct.",
  }, env, "claude")).stdout);
  assert.equal(unstructured?.decision, "block");
  assert.match(unstructured?.reason ?? "", /BR_REVIEW_RESULT.*reviewNonce/iu);
  const started = parseOutput((await runHook("review-start", {
    hook_event_name: "SubagentStart", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent", transcript_path: childTranscriptPath,
  }, env, "claude")).stdout);
  const context = started?.hookSpecificOutput?.additionalContext ?? "";
  assert.ok(context.indexOf("evidencePaths=") >= 0 && context.indexOf("evidencePaths=") < 1000, "exact reviewer anchors must survive a host's short context preview");
  assert.match(context, /taskRequest=.*preserve the populated peer/u);
  assert.match(context, /candidateCases=.*BR-C1/u);
  assert.match(context, /challengePack=.*concurrency\.interleaving/u);
  assert.doesNotMatch(context, /challengePack=.*"expected"/u);
  assert.match(context, /known defect.*baseline failure.*not.*challenge|do not challenge.*baseline.*fails/iu);
  assert.match(context, /baseline assertion.*target behavior.*supersed|supersed.*baseline assertion/iu);
  assert.match(context, /bounded local review.*do not.*research|do not.*research.*bounded local review/iu);
  assert.match(context, /counterexample.*12\.\.1000 (?:characters|chars)/iu);
  assert.match(context, /challengeResults.*derivedExpected/iu);
  assert.match(context, /slot-specific shapes.*valueShape applies only to derivedExpected.*contrastValueShape applies only to rejectedAlternative.*raw-json.*native JSON value.*no prose/iu);
  assert.match(context, /contract-conflicts.*derivedExpected.*rejectedAlternative.*decision challenge/iu);
  assert.match(context, /FIRST ACTION: use Read on every exact evidencePaths entry/iu);
  assert.match(context, /If a file is long.*Read.*offset.*limit/iu);
  assert.match(context, /Do not simulate (?:an unavailable|missing) Grep with Bash/iu);
  const nonce = context.match(/reviewNonce[=:]\s*([a-f0-9]+)/u)?.[1];
  assert.ok(nonce, context);

  const researchDenied = parseOutput((await runHook("review-pre", {
    cwd: fx.root, session_id: session, agent_id: "oracle-agent",
    tool_name: "mcp__plugin_research-provenance-guard_research_provenance__research_begin",
    tool_input: { question: "derive the oracle" },
  }, env, "claude")).stdout);
  assert.equal(researchDenied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(researchDenied?.hookSpecificOutput?.permissionDecisionReason ?? "", /bounded local review|research.*forbidden/iu);
  assert.match(researchDenied?.hookSpecificOutput?.permissionDecisionReason ?? "", /use Read on.*exact evidencePaths.*offset.*limit/iu);
  assert.match(researchDenied?.hookSpecificOutput?.permissionDecisionReason ?? "", /Do not simulate (?:an unavailable|missing) Grep with Bash/iu);

  const uncheckedChallenge = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT {"contractId":"${contract.id}","stage":"oracle","reviewNonce":"${nonce}","decision":"approve","checkedDimensions":["concurrency"],"counterexamples":["repeat the transition under an interleaving"],"evidenceAnchors":["src/normalize.js"]}`,
  }, env, "claude")).stdout);
  assert.equal(uncheckedChallenge?.decision, "block");
  assert.match(uncheckedChallenge?.reason ?? "", /checkedChallenges.*concurrency\.interleaving/iu);

  const oversizedCounterexample = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "challenge",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      counterexamples: ["x".repeat(1001)],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude")).stdout);
  assert.equal(oversizedCounterexample?.decision, "block");
  assert.match(oversizedCounterexample?.reason ?? "", /counterexamples\[0\].*1001.*maximum.*1000/iu);

  const unreadEvidence = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT {"contractId":"${contract.id}","stage":"oracle","reviewNonce":"${nonce}","decision":"approve","checkedDimensions":["concurrency"],"checkedChallenges":["concurrency.interleaving"],"counterexamples":["repeat the transition under an interleaving"],"evidenceAnchors":["src/normalize.js"]}`,
  }, env, "claude")).stdout);
  assert.equal(unreadEvidence?.decision, "block");
  assert.match(unreadEvidence?.reason ?? "", /reviewer must read each exact evidencePaths entry.*src\/normalize\.js/iu);

  const readEvidence = await runHook("review-pre", {
    cwd: fx.root, session_id: session, agent_id: "oracle-agent",
    tool_name: "Read", tool_input: { file_path: join(fx.root, "src", "normalize.js") },
  }, env, "claude");
  assert.equal(readEvidence.stdout, "", readEvidence.stderr);

  const templateEcho = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: "state the concrete challenge input",
        derivedExpected: "derive independently from task and evidence",
        rejectedAlternative: "derive the contrasted shortcut outcome independently",
        disposition: "contract-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition under an interleaving"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude")).stdout);
  assert.equal(templateEcho?.decision, "block");
  assert.match(templateEcho?.reason ?? "", /derive independently|placeholder/iu);

  const paddedTemplateEcho = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: " state the concrete challenge input ",
        derivedExpected: " derive independently from task and evidence ",
        rejectedAlternative: " derive the contrasted shortcut outcome independently ",
        disposition: "contract-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition under an interleaving"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude")).stdout);
  assert.equal(paddedTemplateEcho?.decision, "block");
  assert.match(paddedTemplateEcho?.reason ?? "", /derive independently|placeholder/iu);

  const missingAlternative = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: "two overlapping state transitions",
        derivedExpected: "the declared transition policy remains deterministic",
        disposition: "contract-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition under an interleaving"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude")).stdout);
  assert.equal(missingAlternative?.decision, "block");
  assert.match(missingAlternative?.reason ?? "", /rejectedAlternative.*distinguish/iu);

  const whitespaceOnlyDifference = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: "two overlapping state transitions",
        derivedExpected: "same observed transition state",
        rejectedAlternative: " same observed transition state ",
        disposition: "contract-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition under an interleaving"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude")).stdout);
  assert.equal(whitespaceOnlyDifference?.decision, "block");
  assert.match(whitespaceOnlyDifference?.reason ?? "", /distinct rejectedAlternative.*distinguish/iu);

  const reviewed = await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "oracle-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "oracle",
      reviewNonce: nonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: "two overlapping state transitions",
        derivedExpected: "the declared transition policy remains deterministic",
        rejectedAlternative: "an eager transition reads stale state and diverges",
        disposition: "contract-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition under an interleaving"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude");
  assert.match(`${reviewed.stdout}${reviewed.stderr}`, /review.*approved|approval.*recorded/iu);

  const duplicateReview = parseOutput((await runHook("review-pre", {
    cwd: fx.root, session_id: session, tool_name: "Agent", tool_use_id: "tool-review-duplicate",
    tool_input: { prompt },
  }, env, "claude")).stdout);
  assert.equal(duplicateReview?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(duplicateReview?.hookSpecificOutput?.permissionDecisionReason ?? "", /current oracle approval.*already|reuse.*BR-V/iu);

  const allowed = await runHook("pre", {
    cwd: fx.root, session_id: session, tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env, "claude");
  assert.equal(allowed.stdout, "", allowed.stderr);

  writeFileSync(join(fx.root, "src", "normalize.js"), "fixed\n");
  for (const [index, [command, output]] of [
    ["node test/primary.mjs", "PRIMARY_FIXED"],
    ["node test/boundary.mjs", "BOUNDARY_OK"],
    ["node test/representation.mjs", "REPRESENTATION_FIXED"],
    ["node test/compat.mjs", "COMPAT_OK"],
  ].entries()) {
    const observed = await runHook("post", {
      cwd: fx.root, session_id: session, tool_name: "Bash",
      tool_input: { command }, tool_response: { exit_code: 0, output },
    }, env, "claude");
    contract.cases[index].receipts.after = observed.stdout.match(/BR-R[0-9]+/u)?.[0] ?? null;
  }
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env, "claude");
  const blockedStop = await runHook("stop", { cwd: fx.root, session_id: session }, env, "claude");
  assert.match(blockedStop.stdout, /patch independent review approval is missing/u);

  const patchPrompt = `BR_REVIEW_REQUEST ${contract.id} patch`;
  await runHook("review-pre", {
    cwd: fx.root, session_id: session, tool_name: "Agent", tool_use_id: "tool-review-2",
    tool_input: { prompt: patchPrompt },
  }, env, "claude");
  const patchStarted = parseOutput((await runHook("review-start", {
    hook_event_name: "SubagentStart", cwd: fx.root, session_id: session,
    agent_id: "patch-agent", agent_prompt: patchPrompt,
  }, env, "claude")).stdout);
  const patchContext = patchStarted?.hookSpecificOutput?.additionalContext ?? "";
  assert.match(patchContext, /patch stage.*current production.*project-test/iu);
  const patchNonce = patchContext.match(/reviewNonce[=:]\s*([a-f0-9]+)/u)?.[1];
  assert.ok(patchNonce, patchContext);
  await runHook("review-pre", {
    cwd: fx.root, session_id: session, agent_id: "patch-agent",
    tool_name: "Read", tool_input: { file_path: join(fx.root, "src", "normalize.js") },
  }, env, "claude");
  const patchReviewed = await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "patch-agent",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify({
      contractId: contract.id,
      stage: "patch",
      reviewNonce: patchNonce,
      decision: "approve",
      checkedDimensions: ["concurrency"],
      checkedChallenges: ["concurrency.interleaving"],
      challengeResults: [{
        id: "concurrency.interleaving",
        input: "two overlapping state transitions",
        derivedExpected: "the implementation remains deterministic",
        rejectedAlternative: "an eager transition reads stale state and diverges",
        disposition: "implementation-conforms",
        evidenceAnchor: "src/normalize.js",
      }],
      counterexamples: ["repeat the transition after the production diff"],
      evidenceAnchors: ["src/normalize.js"],
    })}`,
  }, env, "claude");
  assert.match(`${patchReviewed.stdout}${patchReviewed.stderr}`, /patch review.*approval recorded/iu);
  contract.status = "closed";
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env, "claude");
  const closedVerification = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: session, tool_name: "Edit",
    tool_input: { file_path: "test/primary.mjs", new_string: "late regression" },
  }, env, "claude")).stdout);
  assert.equal(closedVerification?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(closedVerification?.hookSpecificOutput?.permissionDecisionReason ?? "", /closed contract.*verification.*frozen/iu);
  const released = await runHook("stop", { cwd: fx.root, session_id: session }, env, "claude");
  assert.equal(released.stdout, "", released.stderr);
});

test("independent-review recovery preserves frozen inputs and requires one final result line", async () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.semantics = ["ordering"];
  contract.cases[1].coverage.push("independent-order", "shared-order", "conflict-order");
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  const env = { PLUGIN_DATA: fx.data };
  const session = "review-recovery-card";
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path },
  }, env, "claude");
  for (const [index, [command, outcome, output]] of [
    ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
    ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
    ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
    ["node test/compat.mjs", "success", "COMPAT_OK"],
  ].entries()) {
    const observed = await runHook(outcome === "failure" ? "failure" : "post", {
      cwd: fx.root, session_id: session, tool_name: "Bash",
      tool_input: { command }, tool_response: { exit_code: outcome === "failure" ? 1 : 0, output },
    }, env, "claude");
    contract.cases[index].receipts.before = observed.stdout.match(/BR-R[0-9]+/u)?.[0] ?? null;
  }
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path },
  }, env, "claude");
  const prompt = `BR_REVIEW_REQUEST ${contract.id} oracle`;
  await runHook("review-pre", {
    cwd: fx.root, session_id: session, tool_name: "Agent", tool_use_id: "tool-review-recovery",
    tool_input: { prompt },
  }, env, "claude");

  const orderingStarted = parseOutput((await runHook("review-start", {
    hook_event_name: "SubagentStart", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
  }, env, "claude")).stdout);
  const orderingContext = orderingStarted?.hookSpecificOutput?.additionalContext ?? "";
  assert.match(orderingContext, /stable-topological-layers.*freeze.*all.*(?:indegree|in-degree).*zero.*whole layer.*first-seen.*unlock.*next layer/iu);

  const unstructured = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer", last_assistant_message: "I checked the ordering policy.",
  }, env, "claude")).stdout);
  assert.equal(unstructured?.decision, "block");
  assert.match(unstructured?.reason ?? "", /valueMode and its slot-specific shapes/iu);
  assert.match(unstructured?.reason ?? "", /raw-json.*native JSON value.*no prose/iu);
  assert.match(unstructured?.reason ?? "", /contract-conflicts.*derivedExpected.*rejectedAlternative.*decision challenge/iu);
  assert.match(unstructured?.reason ?? "", /contract-conflicts.*distinct from derivedExpected.*rejectedAlternative.*applicable shape/iu);
  assert.match(unstructured?.reason ?? "", /do not guess.*hidden contract oracle/iu);
  assert.doesNotMatch(unstructured?.reason ?? "", /put the contract outcome you reject in rejectedAlternative/iu);
  assert.match(unstructured?.reason ?? "", /stable-topological-layers.*freeze.*all.*(?:indegree|in-degree).*zero.*whole layer.*first-seen.*unlock.*next layer/iu);
  const cardText = (unstructured?.reason ?? "").split("BR_REVIEW_RESULT ").at(-1);
  const card = JSON.parse(cardText);
  assert.deepEqual(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.input, [[1, 2], [3, 4]]);
  assert.deepEqual(card.challengeResults.find((item) => item.id === "ordering.independent-chains")?.input, [[1, 2, 7], [3, 4], [5, 6]]);
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.derivedExpected, null);
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.rejectedAlternative, null);
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.oraclePolicy, "stable-topological-layers");
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.contrastPolicy, "eager-first-seen");
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.valueMode, "raw-json");
  assert.equal(card.challengeResults.find((item) => item.id === "ordering.independent-pair")?.valueShape, "array-of-numbers");
  assert.match(unstructured?.reason ?? "", /valueShape.*array-of-numbers/iu);
  assert.match(unstructured?.reason ?? "", /qualitative-string-12\.\.1000.*descriptive JSON string.*never an array or object/iu);
  assert.doesNotMatch(cardText, /"derivedExpected":\s*\[|"rejectedAlternative":\s*\[/u);

  await runHook("review-pre", {
    cwd: fx.root, session_id: session, agent_id: "ordering-reviewer",
    tool_name: "Read", tool_input: { file_path: join(fx.root, "src", "normalize.js") },
  }, env, "claude");

  const mismatchedConformsCard = JSON.parse(JSON.stringify(card));
  mismatchedConformsCard.decision = "approve";
  Object.assign(mismatchedConformsCard.challengeResults[0], {
    derivedExpected: [1, 2, 3, 4],
    rejectedAlternative: [4, 3, 2, 1],
    disposition: "contract-conforms",
  });
  Object.assign(mismatchedConformsCard.challengeResults[1], {
    derivedExpected: [1, 3, 5, 2, 4, 6, 7],
    rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
    disposition: "contract-conforms",
  });
  mismatchedConformsCard.counterexamples = ["the independently derived pair differs from the frozen contract oracle"];
  const mismatchedConforms = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify(mismatchedConformsCard)}`,
  }, env, "claude")).stdout);
  assert.equal(mismatchedConforms?.decision, "block");
  assert.match(mismatchedConforms?.reason ?? "", /does not equal the frozen contract oracle.*keep.*derivedExpected.*contract-conflicts.*decision challenge.*do not guess.*hidden/iu);

  const nonFinal = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify(card)}\nI later found a conflicting counterexample.`,
  }, env, "claude")).stdout);
  assert.equal(nonFinal?.decision, "block");
  assert.match(nonFinal?.reason ?? "", /exactly one final line/iu);
  const nonFinalCard = JSON.parse((nonFinal?.reason ?? "").split("BR_REVIEW_RESULT ").at(-1));
  assert.deepEqual(nonFinalCard.challengeResults.find((item) => item.id === "ordering.independent-pair")?.input, [[1, 2], [3, 4]]);
  assert.doesNotMatch(JSON.stringify(nonFinalCard), /"derivedExpected":\s*\[|"rejectedAlternative":\s*\[/u);

  const duplicate = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify(card)}\nBR_REVIEW_RESULT ${JSON.stringify(card)}`,
  }, env, "claude")).stdout);
  assert.equal(duplicate?.decision, "block");
  assert.match(duplicate?.reason ?? "", /exactly one final line/iu);
  const duplicateCard = JSON.parse((duplicate?.reason ?? "").split("BR_REVIEW_RESULT ").at(-1));
  assert.deepEqual(duplicateCard.challengeResults.find((item) => item.id === "ordering.independent-chains")?.input, [[1, 2, 7], [3, 4], [5, 6]]);

  const explanatoryMention = parseOutput((await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
    last_assistant_message: "I will now emit BR_REVIEW_RESULT as required.\nBR_REVIEW_RESULT {}",
  }, env, "claude")).stdout);
  assert.equal(explanatoryMention?.decision, "block");
  assert.doesNotMatch(explanatoryMention?.reason ?? "", /must be exactly one final line/iu);
  assert.match(explanatoryMention?.reason ?? "", /lifecycle reservation/iu);

  const coarseShapeConflictCard = JSON.parse(JSON.stringify(card));
  coarseShapeConflictCard.decision = "challenge";
  Object.assign(coarseShapeConflictCard.challengeResults[0], {
    derivedExpected: [1, 2, 3],
    rejectedAlternative: [9],
    disposition: "contract-conflicts",
  });
  Object.assign(coarseShapeConflictCard.challengeResults[1], {
    derivedExpected: [1, 3, 5, 2, 4, 6, 7],
    rejectedAlternative: [1, 2, 7, 3, 4, 5, 6],
    disposition: "contract-conforms",
  });
  coarseShapeConflictCard.counterexamples = ["the independent pair has a different array length from the frozen oracle"];
  const coarseShapeConflict = await runHook("subagent-stop", {
    hook_event_name: "SubagentStop", cwd: fx.root, session_id: session,
    agent_id: "ordering-reviewer",
    last_assistant_message: `BR_REVIEW_RESULT ${JSON.stringify(coarseShapeConflictCard)}`,
  }, env, "claude");
  assert.match(`${coarseShapeConflict.stdout}${coarseShapeConflict.stderr}`, /challenge recorded.*replan/iu);
});

test("Claude parent shell cannot bypass an incomplete BEFORE gate with an inline file writer", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "parent-shell-write";
  await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env, "claude");

  const command = `python << 'PYEOF'
path = 'src/normalize.js'
with open(path, 'w') as f:
    f.write('bypass\\n')
PYEOF`;
  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Bash",
    tool_input: { command },
  }, env, "claude")).stdout);

  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /BEFORE proof is incomplete/iu);
  assert.equal(readFileSync(join(fx.root, "src", "normalize.js"), "utf8"), "bug\n");
});

test("an invalid bound contract directs shell recovery to Edit or Write", async () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.surface.inputShape = "unsupported-shape";
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  const env = { PLUGIN_DATA: fx.data };
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "invalid-shell-recovery",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env, "claude");
  assert.match(activation.stdout, /activation rejected/iu);

  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "invalid-shell-recovery",
    tool_name: "Bash",
    tool_input: { command: `python -c "open('${fx.path}', 'w').write('{}')"` },
  }, env, "claude")).stdout);

  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /shell mutation (?:was not executed|is denied).*Edit or Write.*contract/iu);

  const projectTest = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "invalid-shell-recovery",
    tool_name: "Edit",
    tool_input: { file_path: join(fx.root, "test", "primary.mjs"), new_string: "weakened" },
  }, env, "claude")).stdout);
  assert.equal(projectTest?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(projectTest?.hookSpecificOutput?.permissionDecisionReason ?? "", /bound proof state is invalid.*Edit or Write.*contract/iu);

  const restore = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "invalid-shell-recovery",
    tool_name: "Bash",
    tool_input: { command: "git restore test/primary.mjs" },
  }, env, "claude")).stdout);
  assert.equal(restore?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(restore?.hookSpecificOutput?.permissionDecisionReason ?? "", /shell mutation.*denied.*invalid/iu);
});

test("shell mutation detection ignores descriptor-only null redirection", () => {
  for (const command of [
    "git status --short 2>/dev/null",
    "grep -R needle . >/dev/null",
    "find . -name '*.py' 2>&1",
    "python -V 2> /dev/null",
  ]) assert.equal(hasShellMutationIntent(command), false, command);

  for (const command of [
    "echo changed > src/output.txt",
    "python tool.py 2> diagnostics.log",
    "generate >> artifacts.jsonl",
    "rm test/primary.mjs",
    "git restore test/primary.mjs",
    "git checkout -- test/primary.mjs",
    "dd if=/dev/null of=src/normalize.js",
  ]) assert.equal(hasShellMutationIntent(command), true, command);
});

test("shell mutation detection ignores redirection-like text inside quoted program arguments", () => {
  assert.equal(hasShellMutationIntent('python -c "print(\'a -> b\')"'), false);
  assert.equal(hasShellMutationIntent('node -e "console.log(\'a => b\')"'), false);
  assert.equal(hasShellMutationIntent("echo 'a -> b' > real-file"), true);
});

test("SessionStart publishes a compact route before any contract exists", async () => {
  const fx = emptyFixture();
  const result = await runHook("session", {
    cwd: fx.root,
    session_id: "standing-route-session",
  }, { PLUGIN_DATA: fx.data });

  assert.equal(result.code, 0, result.stderr);
  const output = parseOutput(result.stdout);
  const context = output?.hookSpecificOutput?.additionalContext ?? "";
  assert.equal(output?.hookSpecificOutput?.hookEventName, "SessionStart");
  assert.match(context, /`\$behavioral-regression`/u);
  assert.match(context, /Reproducible-fix evidence/iu);
  assert.ok(context.length <= 60, `SessionStart context is ${context.length} characters`);
  assert.doesNotMatch(context, /^\s*\[[^\]]+\]/u);
  assert.doesNotMatch(context, /normalize|media|world|pixel|dependency chain/iu);
});

test("v8 AFTER receipts require a runtime witness for the frozen component matrix", async () => {
  const fx = relationFixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "relation-witness";
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  const before = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: fx.contract.cases[0].command },
    tool_response: { exit_code: 1, output: "LEFT_EMPTY_REPRO" },
  }, env);
  assert.match(before.stdout, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);
  writeFileSync(join(fx.root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\nmodule.exports = { mapChannels, fixed: true };\n");

  const markerOnly = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: fx.contract.cases[0].command },
    tool_response: { exit_code: 0, output: "LEFT_EMPTY_FIXED\nBR_RELATION_C1_RIGHT" },
  }, env);
  assert.doesNotMatch(markerOnly.stdout, /Receipt BR-R/u);
  assert.match(markerOnly.stdout, /relation witness/iu);

  const substituted = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: fx.contract.cases[0].command },
    tool_response: { exit_code: 0, output: 'LEFT_EMPTY_FIXED\nBR_RELATION_C1_RIGHT {"components":{"left":{"value":[],"representation":"array:length=0"},"right":{"value":[2],"representation":"array:length=1"}},"source":{"value":[],"representation":"array:length=0"},"target":{"value":[],"representation":"array:length=0"}}' },
  }, env);
  assert.doesNotMatch(substituted.stdout, /Receipt BR-R/u);
  assert.match(substituted.stdout, /sourceSample/iu);

  const duplicate = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: fx.contract.cases[0].command },
    tool_response: { exit_code: 0, output: 'LEFT_EMPTY_FIXED\nBR_RELATION_C1_RIGHT {"components":{"left":{"value":[],"representation":"array:length=0"},"right":{"value":[2],"representation":"array:length=1"}},"source":{"value":[],"representation":"array:length=0"},"target":{"value":[],"representation":"array:length=0"}}\nBR_RELATION_C1_RIGHT {"components":{"left":{"value":[],"representation":"array:length=0"},"right":{"value":[2],"representation":"array:length=1"}},"source":{"value":[2],"representation":"array:length=1"},"target":{"value":[6],"representation":"array:length=1"}}' },
  }, env);
  assert.doesNotMatch(duplicate.stdout, /Receipt BR-R/u);
  assert.match(duplicate.stdout, /exactly once/iu);

  const valid = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: fx.contract.cases[0].command },
    tool_response: { exit_code: 0, output: 'LEFT_EMPTY_FIXED\nBR_RELATION_C1_RIGHT {"components":{"left":{"value":[],"representation":"array:length=0"},"right":{"value":[2],"representation":"array:length=1"}},"source":{"value":[2],"representation":"array:length=1"},"target":{"value":[6],"representation":"array:length=1"}}' },
  }, env);
  assert.match(valid.stdout, /Receipt BR-R[0-9]+.*BR-C1 AFTER/u);
});

test("v8 ordering receipts require runtime evidence for every adversarial scenario", async () => {
  const contract = witnessedOrderingContract();
  const fx = relationFixture(contract);
  const env = { PLUGIN_DATA: fx.data };
  const session = "ordering-witness";
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  const item = contract.cases[3];
  const before = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: item.command }, tool_response: { exit_code: 0, output: "COMPAT_OK" },
  }, env);
  assert.match(before.stdout, /Receipt BR-R[0-9]+.*BR-C4 BEFORE/u);
  writeFileSync(join(fx.root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\nmodule.exports = { mapChannels, fixed: true };\n");

  const eagerOutput = [
    ...item.oracle.scenarios.map((scenario, index) => `${scenario.marker} ${JSON.stringify({
      contributors: scenario.contributors,
      actual: index === 0 ? { order: [1, 2, 3, 4, 5, 6], diagnostics: [] } : scenario.expected,
    })}`),
  ].join("\n");
  const failedAfter = await runHook("failure", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: item.command }, tool_response: { exit_code: 1, output: eagerOutput },
  }, env);
  assert.match(failedAfter.stdout, /BR_SCENARIO_INDEPENDENT/u);
  assert.match(failedAfter.stdout, /actual.*1.*2.*3.*4.*5.*6/iu);
  assert.match(failedAfter.stdout, /expected.*1.*3.*5.*2.*4.*6/iu);
  assert.doesNotMatch(failedAfter.stdout, /BEFORE evidence cannot/iu);

  const markerOnlyOutput = ["COMPAT_OK", ...item.oracle.scenarios.map((scenario) => scenario.marker)].join("\n");
  const markerOnly = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: item.command }, tool_response: { exit_code: 0, output: markerOnlyOutput },
  }, env);
  assert.doesNotMatch(markerOnly.stdout, /Receipt BR-R/u);
  assert.match(markerOnly.stdout, /scenario witness/iu);

  const wrongDiagnosticOutput = ["COMPAT_OK", ...item.oracle.scenarios.map((scenario) => `${scenario.marker} ${JSON.stringify({
    contributors: scenario.contributors,
    actual: scenario.kind === "genuine-cycle"
      ? { ...scenario.expected, diagnostics: ["runtime warning text is independently compatibility-tested"] }
      : scenario.expected,
  })}`)].join("\n");
  const wrongDiagnostic = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: item.command },
    tool_response: { exit_code: 0, output: wrongDiagnosticOutput },
  }, env);
  assert.doesNotMatch(wrongDiagnostic.stdout, /Receipt BR-R/u);
  assert.match(wrongDiagnostic.stdout, /genuine-cycle|scenario witness.*does not match expected/iu);

  const witnessedOutput = ["COMPAT_OK", ...item.oracle.scenarios.map((scenario) => `${scenario.marker} ${JSON.stringify({
    contributors: scenario.contributors,
    actual: scenario.expected,
  })}`)].join("\n");
  const valid = await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: item.command }, tool_response: { exit_code: 0, output: witnessedOutput },
  }, env);
  assert.match(valid.stdout, /Receipt BR-R[0-9]+.*BR-C4 AFTER/u);
});

test("v11 AFTER receipts require exact structured ordering and cycle diagnostic witnesses", async () => {
  const fx = v11OrderingFixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "v11-ordering-witness";
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /Bound/u);

  const item = fx.contract.cases[2];
  const before = await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "exec_command",
    tool_input: { cmd: item.command },
    tool_response: { exit_code: 1, output: item.before.includes.join("\n") },
  }, env);
  assert.match(before.stdout, /Receipt BR-R[0-9]+.*BR-C3 BEFORE/u);
  writeFileSync(join(fx.root, "src", "channel-map.cjs"), "function mapChannels(left, right) { return [left, right]; }\nmodule.exports = { mapChannels, fixed: true };\n");

  const relationWitnesses = (item.oracle.relations ?? []).map((relation) => `${relation.marker} ${JSON.stringify({
    components: item.componentSamples,
    source: relation.sourceSample,
    target: relation.targetSample,
  })}`);
  const scenarioWitnesses = (diagnostics) => item.oracle.scenarios.map((scenario) => `${scenario.marker} ${JSON.stringify({
    contributors: scenario.contributors,
    actual: scenario.kind === "genuine-cycle" ? { ...scenario.expected, diagnostics } : scenario.expected,
  })}`);
  const requiredMarkers = item.after.includes.filter((literal) => !literal.startsWith("BR_RELATION_") && !literal.startsWith("BR_SCENARIO_"));
  const wrong = await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "exec_command",
    tool_input: { cmd: item.command },
    tool_response: {
      exit_code: 0,
      output: [...requiredMarkers, ...relationWitnesses, ...scenarioWitnesses(["arbitrary warning"])].join("\n"),
    },
  }, env);
  assert.doesNotMatch(wrong.stdout, /Receipt BR-R/u);
  assert.match(wrong.stdout, /scenario witness.*does not match expected/iu);

  const cycle = item.oracle.scenarios.find((scenario) => scenario.kind === "genuine-cycle");
  const correct = await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "exec_command",
    tool_input: { cmd: item.command },
    tool_response: {
      exit_code: 0,
      output: [...requiredMarkers, ...relationWitnesses, ...scenarioWitnesses(cycle.expected.diagnostics)].join("\n"),
    },
  }, env);
  assert.match(correct.stdout, /Receipt BR-R[0-9]+.*BR-C3 AFTER/u);
});

test("a failing behavioral probe blocks production edits but permits proof assets", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  const probe = {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/regression_test.py" },
    tool_response: { exit_code: 1, output: "FAILED test/regression_test.py::test_boundary" },
  };
  await runHook("post", probe, env);

  let reminder;
  for (const command of ["git status --short", "rg ConflictWarning src/order-plan.cjs", "git diff --stat"]) {
    reminder = await runHook("post", {
      cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
      tool_input: { cmd: command }, tool_response: { exit_code: 0, output: "diagnostic output" },
    }, env);
  }
  assert.match(reminder.stdout, /behavioral failure.*still active.*behavioral-regression/iu);

  for (const command of ["git log -1 --oneline", "rg warning tests", "python -c 'print(1)'"]) {
    await runHook("post", {
      cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
      tool_input: { cmd: command }, tool_response: { exit_code: 0, output: "more diagnostic output" },
    }, env);
  }
  const exhausted = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
    tool_input: { cmd: "git status --short" },
  }, env)).stdout);
  assert.equal(exhausted?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(exhausted?.hookSpecificOutput?.permissionDecisionReason ?? "", /diagnostic budget.*behavioral-regression/iu);

  const routedSkill = await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Skill",
    tool_input: { skill: "behavioral-regression-guard:behavioral-regression" },
  }, env, "claude");
  assert.equal(routedSkill.stdout, "", "the required behavioral-regression Skill must remain reachable");

  const repeated = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
    tool_input: { cmd: "git log -1 --oneline" },
  }, env)).stdout);
  assert.match(repeated?.hookSpecificOutput?.permissionDecisionReason ?? "", /did not execute/iu);
  assert.doesNotMatch(repeated?.hookSpecificOutput?.permissionDecisionReason ?? "", /Read\/Grep/iu);
  assert.doesNotMatch(repeated?.hookSpecificOutput?.permissionDecisionReason ?? "", /terminal|next action must/iu);

  const terminalRecovery = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
    tool_input: { cmd: "find . -maxdepth 2 -type f" },
  }, env)).stdout);
  assert.match(terminalRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /recovery denial 3.*only accepted next tool.*\{"file_path".*\.behavioral-regression\/BR-<id>\/bundle/iu);

  const terminalRead = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Read",
    tool_input: { file_path: join(fx.root, "src", "subject.py") },
  }, env)).stdout);
  assert.equal(terminalRead?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(terminalRead?.hookSpecificOutput?.permissionDecisionReason ?? "", /terminal.*recovery.*Write.*Edit.*(?:managed proof|\.behavioral-regression\/BR-<id>\/bundle)/iu);
  assert.match(terminalRead?.hookSpecificOutput?.permissionDecisionReason ?? "", /recovery denial 4.*only accepted next tool.*\{"file_path"/iu);

  const terminalSkill = await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Skill",
    tool_input: { skill: "behavioral-regression" },
  }, env, "claude");
  assert.equal(terminalSkill.stdout, "", "terminal recovery must not hide the required contract instructions");

  const terminalContractReference = await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Read",
    tool_input: { file_path: "/plugins/behavioral-regression-guard/skills/behavioral-regression/references/contract.md" },
  }, env, "claude");
  assert.equal(terminalContractReference.stdout, "", "terminal recovery must allow the exact reference required by the behavioral-regression Skill");

  const unrelatedReference = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Read",
    tool_input: { file_path: "/plugins/behavioral-regression-guard/README.md" },
  }, env, "claude")).stdout);
  assert.equal(unrelatedReference?.hookSpecificOutput?.permissionDecision, "deny");

  const terminalCodex = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Edit",
    tool_input: { file_path: join(fx.root, "src", "subject.py"), new_string: "changed" },
  }, env, "codex")).stdout);
  assert.equal(terminalCodex?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(terminalCodex?.hookSpecificOutput?.permissionDecisionReason ?? "", /recovery denial 6.*only accepted next tool is apply_patch/iu);
  assert.match(terminalCodex?.hookSpecificOutput?.permissionDecisionReason ?? "", /blockingContract:.*unblockWhen=/iu);

  for (const [tool_name, tool_input] of [
    ["Grep", { pattern: "subject", path: fx.root }],
    ["Agent", { prompt: "inspect the failure" }],
    ["Skill", { skill: "unrelated" }],
    ["Write", { file_path: join(fx.root, "test", "extra_test.py"), content: "pass\n" }],
  ]) {
    const deniedTool = parseOutput((await runHook("pre", {
      cwd: fx.root, session_id: "probe-gate", tool_name, tool_input,
    }, env)).stdout);
    assert.equal(deniedTool?.hookSpecificOutput?.permissionDecision, "deny", tool_name);
  }

  mkdirSync(join(fx.root, ".behavioral-regression", "BR-20260810-boundary"), { recursive: true });
  const managedWrite = await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "Write",
    tool_input: {
      file_path: join(fx.root, ".behavioral-regression", "BR-20260810-boundary", "primary.py"),
      content: "print('PRIMARY_REPRO')\n",
    },
  }, env);
  assert.equal(managedWrite.stdout, "", "terminal recovery must permit a managed proof write");
  writeFileSync(join(fx.root, ".behavioral-regression", "BR-20260810-boundary", "primary.py"), "print('PRIMARY_REPRO')\n");
  const invalidContractPath = join(fx.root, ".behavioral-regression", "BR-20260810-boundary.json");
  writeFileSync(invalidContractPath, "{}\n");
  const invalidContractRecovery = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
    tool_input: { cmd: "git status --short" },
  }, env)).stdout);
  assert.match(invalidContractRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /existing.*contract.*invalid.*(?:Edit|Write).*BR-20260810-boundary\.json/iu);

  const orderingInvalid = regressionContract();
  orderingInvalid.schema = "behavioral-regression/v11";
  orderingInvalid.id = "BR-20260810-boundary";
  orderingInvalid.surface.semantics = ["ordering"];
  orderingInvalid.scope.verificationPaths = [".behavioral-regression/BR-20260810-boundary/primary.py"];
  writeFileSync(invalidContractPath, `${JSON.stringify(orderingInvalid, null, 2)}\n`);
  const orderingRecovery = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "probe-gate", tool_name: "exec_command",
    tool_input: { cmd: "echo skip" },
  }, env)).stdout);
  assert.match(orderingRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /stable-topological-layers.*freeze.*indegree-zero.*whole layer.*supersed.*not preserv/iu);
  assert.doesNotMatch(orderingRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /\[1,2,3,4\]|\[1,3,2,4\]/u);
  assert.match(orderingRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /metadata.*do not edit.*regression file/iu);
  assert.match(orderingRecovery?.hookSpecificOutput?.permissionDecisionReason ?? "", /only accepted repair targets.*BR-20260810-boundary\.json.*BR-20260810-boundary\/primary\.py/iu);

  const managedProof = await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python .behavioral-regression/BR-20260810-boundary/primary.py" },
  }, env);
  assert.equal(managedProof.stdout, "", "the exhausted diagnostic budget must still permit a direct managed proof run");

  const chainedProof = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python .behavioral-regression/BR-20260810-boundary/primary.py; git status --short" },
  }, env)).stdout);
  assert.equal(chainedProof?.hookSpecificOutput?.permissionDecision, "deny", "a proof path must not launder extra shell diagnostics");

  const echoedProof = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python .behavioral-regression/BR-20260810-boundary/primary.py; echo \"exit=$?\"" },
  }, env)).stdout);
  assert.equal(echoedProof?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(echoedProof?.hookSpecificOutput?.permissionDecisionReason ?? "", /trailing.*echo.*forbidden.*run exactly:.*python \.behavioral-regression\/BR-20260810-boundary\/primary\.py/iu);

  const inlineProof = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python -c 'print(1)' .behavioral-regression/BR-20260810-boundary/primary.py" },
  }, env)).stdout);
  assert.equal(inlineProof?.hookSpecificOutput?.permissionDecision, "deny", "a managed path must not launder inline code execution");

  const multilineProof = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "exec_command",
    tool_input: { cmd: "python .behavioral-regression/BR-20260810-boundary/primary.py\ngit status --short" },
  }, env)).stdout);
  assert.equal(multilineProof?.hookSpecificOutput?.permissionDecision, "deny", "a newline must not turn one proof run into multiple commands");

  const production = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "Edit",
    tool_input: { file_path: "src/normalize.py", new_string: "fixed" },
  }, env)).stdout);
  assert.equal(production?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(production?.hookSpecificOutput?.permissionDecisionReason ?? "", /behavioral-regression|contract/iu);
  assert.match(production?.hookSpecificOutput?.permissionDecisionReason ?? "", /\.behavioral-regression\/(?:<id>\/|BR-20260810-boundary\.json)/u);

  const contractRepair = await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "Write",
    tool_input: { file_path: ".behavioral-regression/BR-20260810-boundary.json", content: "proof" },
  }, env);
  assert.equal(contractRepair.stdout, "", "the discovered invalid contract should remain writable");

  const declaredProofRepair = await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "Write",
    tool_input: { file_path: ".behavioral-regression/BR-20260810-boundary/primary.py", content: "proof" },
  }, env);
  assert.equal(declaredProofRepair.stdout, "", "a parsed invalid contract may repair its declared managed proof");

  const undeclaredRepair = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "probe-gate",
    tool_name: "Write",
    tool_input: { file_path: ".behavioral-regression/BR-20260810-boundary/helper.py", content: "proof" },
  }, env)).stdout);
  assert.equal(undeclaredRepair?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(undeclaredRepair?.hookSpecificOutput?.permissionDecisionReason ?? "", /existing behavioral contract is invalid|only accepted next tool.*BR-20260810-boundary\.json/iu);
});

test("a bound contract protects project regression evidence before the first BEFORE receipt", async () => {
  const fx = sourceBoundFixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "baseline-regression",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);

  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "baseline-regression",
    tool_name: "Edit",
    tool_input: {
      file_path: join(fx.root, "test", "channel-map.test.cjs"),
      old_string: "mapChannels([], []);",
      new_string: "mapChannels([1], [2]);",
    },
  }, env)).stdout);
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /regression files.*immutable Git-baseline evidence.*metadata.*managed bundle/iu);

  const undeclaredSibling = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "baseline-regression",
    tool_name: "Write",
    tool_input: {
      file_path: join(fx.root, ".behavioral-regression", fx.contract.id, "helper.mjs"),
      content: "export const forged = true;\n",
    },
  }, env)).stdout);
  assert.equal(undeclaredSibling?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(undeclaredSibling?.hookSpecificOutput?.permissionDecisionReason ?? "", /BEFORE proof is incomplete|production scope is frozen|declared verification/iu);
});

test("a paused contract rejects a symlink alias to immutable regression evidence", async () => {
  const fx = sourceBoundFixture();
  const paused = structuredClone(fx.contract);
  paused.status = "paused";
  writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
  const env = { PLUGIN_DATA: fx.data };
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "paused-regression-alias",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /Bound/iu);

  symlinkSync(join(fx.root, "test", "channel-map.test.cjs"), join(fx.root, "regression-alias.cjs"));
  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "paused-regression-alias",
    tool_name: "Edit",
    tool_input: { file_path: join(fx.root, "regression-alias.cjs"), new_string: "weakened" },
  }, env)).stdout);
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /immutable Git-baseline evidence/iu);
});

test("managed pre-contract proof execution rejects alternate inline runtimes and runner hijacking", () => {
  const fx = emptyFixture();
  const proofRoot = join(fx.root, ".behavioral-regression", "BR-20260810-runtime");
  mkdirSync(proofRoot, { recursive: true });
  const proofPath = join(proofRoot, "primary.py");
  writeFileSync(proofPath, "print('PRIMARY_REPRO')\n");
  const relativeProof = ".behavioral-regression/BR-20260810-runtime/primary.py";

  assert.equal(isManagedProofCommand(`python -Werror ${relativeProof}`, fx.root, fx.root), true);
  for (const command of [
    `php -r 'file_put_contents(\"src/x.php\", \"fixed\");' ${relativeProof}`,
    `perl -E 'say 1' ${relativeProof}`,
    `deno eval 'console.log(1)' ${relativeProof}`,
    `/tmp/python ${relativeProof}`,
    `PATH=/tmp:$PATH python ${relativeProof}`,
    `LD_PRELOAD=/tmp/evil.so python ${relativeProof}`,
    `node --test-reporter=../../evil.mjs ${relativeProof}`,
    `node --experimental-loader=../../evil.mjs ${relativeProof}`,
    `python -V ${relativeProof}`,
  ]) assert.equal(isManagedProofCommand(command, fx.root, fx.root), false, command);
});

test("a managed pre-contract proof cannot redefine the production baseline", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "proof-baseline",
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/primary.mjs" },
    tool_response: { exit_code: 1, output: "FAILED test/primary.mjs::test_boundary" },
  }, env);

  writeFileSync(join(fx.root, "src", "normalize.js"), "changed by proof\n");
  await runHook("post", {
    cwd: fx.root,
    session_id: "proof-baseline",
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/primary.mjs" },
    tool_response: { exit_code: 0, output: "1 passed" },
  }, env);
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "proof-baseline",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /activation rejected.*workspace.*changed.*failure probe/iu);
});

test("pre-contract proof integrity covers undeclared files and the pre-failure workspace", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const helperPath = join(fx.root, "src", "helper.js");
  writeFileSync(helperPath, "baseline helper\n");
  const probe = {
    cwd: fx.root,
    session_id: "proof-workspace",
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/primary.mjs" },
  };

  await runHook("pre", probe, env);
  writeFileSync(helperPath, "changed by failing probe\n");
  await runHook("post", {
    ...probe,
    tool_response: { exit_code: 1, output: "FAILED test/primary.mjs::test_boundary" },
  }, env);
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "proof-workspace",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /activation rejected.*workspace.*changed.*failure probe/iu);
});

test("pre-contract proof integrity rejects an undeclared managed sibling created after the failure", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const probe = {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/primary.mjs" },
  };
  await runHook("pre", probe, env);
  mkdirSync(join(fx.root, ".behavioral-regression", "BR-shadow"), { recursive: true });
  const sibling = join(fx.root, ".behavioral-regression", "BR-shadow", "helper.py");
  const cache = join(fx.root, "test", "__pycache__", "test_primary.cpython-311.pyc");
  writeFileSync(sibling, "FORGED = True\n");
  mkdirSync(join(fx.root, "test", "__pycache__"), { recursive: true });
  writeFileSync(cache, "generated cache\n");
  await runHook("post", {
    ...probe,
    tool_response: { exit_code: 1, output: "FAILED test/primary.mjs::test_boundary" },
  }, env);
  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /activation rejected.*workspace changed after.*failure probe.*BR-shadow\/helper\.py/iu);

  const undeclaredRepair = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "Write",
    tool_input: { file_path: join(fx.root, ".behavioral-regression", "BR-shadow", "replacement.py") },
  }, env)).stdout);
  assert.equal(undeclaredRepair?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(
    undeclaredRepair?.hookSpecificOutput?.permissionDecisionReason ?? "",
    /only valid workspace rollback.*rm -f --.*BR-shadow\/helper\.py.*test_primary\.cpython-311\.pyc/iu,
  );

  const unrelatedRollback = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "Bash",
    tool_input: { command: "rm -f -- src/normalize.js" },
  }, env)).stdout);
  assert.equal(unrelatedRollback?.hookSpecificOutput?.permissionDecision, "deny");

  const exactRollbackCommand = "rm -f -- .behavioral-regression/BR-shadow/helper.py test/__pycache__/test_primary.cpython-311.pyc";
  const exactRollback = await runHook("pre", {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "Bash",
    tool_input: { command: exactRollbackCommand },
  }, env);
  assert.equal(exactRollback.stdout, "");
  rmSync(sibling);
  rmSync(cache);

  const rebound = await runHook("post", {
    cwd: fx.root,
    session_id: "managed-sibling",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(rebound.stdout, /Bound BR-20260809-normalize/iu);
});

test("an armed pre-contract probe rejects ordinary project-test Write and apply_patch", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "armed-project-test-write";
  await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "exec_command",
    tool_input: { cmd: "node test/primary.mjs" },
    tool_response: { exit_code: 1, output: "PRIMARY_REPRO" },
  }, env);

  const remove = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Bash",
    tool_input: { command: "rm test/primary.mjs" },
  }, env)).stdout);
  assert.equal(remove?.hookSpecificOutput?.permissionDecision, "deny");

  const write = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: join(fx.root, "test", "new-regression.mjs"), content: "weakened\n" },
  }, env)).stdout);
  assert.equal(write?.hookSpecificOutput?.permissionDecision, "deny");

  const patch = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "apply_patch",
    tool_input: "*** Begin Patch\n*** Update File: test/primary.mjs\n@@\n-// primary\n+// weakened\n*** End Patch",
  }, env)).stdout);
  assert.equal(patch?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(patch?.hookSpecificOutput?.permissionDecisionReason ?? "", /behavioral failure probe is active.*(?:managed|isolated) bundle/iu);
});

test("an ordinary behavioral warning arms from the pre-command workspace", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const command = "python - <<'PY'\nprint_order_plan()\nPY";
  const event = {
    cwd: fx.root,
    session_id: "ordinary-warning",
    tool_name: "exec_command",
    tool_input: { cmd: command },
  };
  await runHook("pre", event, env);
  writeFileSync(join(fx.root, "src", "normalize.js"), "changed during warning repro\n");
  const armed = await runHook("post", {
    ...event,
    tool_response: {
      exit_code: 0,
      output: "['addon.js', 'theme.js', 'core.js']\nWARNING: Detected duplicate resources in an opposite order:\naddon.js\ncore.js",
    },
  }, env);
  assert.match(armed.stdout, /Behavioral failure observed/iu);

  const activation = await runHook("post", {
    cwd: fx.root,
    session_id: "ordinary-warning",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  assert.match(activation.stdout, /activation rejected.*workspace.*changed.*failure probe/iu);
});

test("a captured non-empty warning list arms without requiring the warning class name", async () => {
  const command = "python repro_order.py";
  const samples = [
    {
      session: "captured-warning-conflict",
      output: "resolved: ['addon.js', 'theme.js', 'core.js'] warnings: ['Detected duplicate resources in an opposite order:\\naddon.js\\ncore.js']",
      armed: true,
    },
    { session: "captured-warning-empty", output: "result._js: ['ok.js'] warnings: []", armed: false },
    { session: "captured-warning-benign", output: "result._js: ['ok.js'] warnings: ['cache warmed']", armed: false },
  ];
  for (const sample of samples) {
    const fx = fixture();
    const result = await runHook("post", {
      cwd: fx.root,
      session_id: sample.session,
      tool_name: "exec_command",
      tool_input: { cmd: command },
      tool_response: { exit_code: 0, output: sample.output },
    }, { PLUGIN_DATA: fx.data });
    if (sample.armed) assert.match(result.stdout, /Behavioral failure observed/iu);
    else assert.equal(result.stdout, "", sample.session);
  }
});

test("source search output mentioning a warning class does not arm a behavioral probe", async () => {
  const fx = fixture();
  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "warning-source-search",
    tool_name: "exec_command",
    tool_input: { cmd: "python -c \"print('3.0.dev')\"; grep -rn ResourceOrderConflictWarning src/" },
    tool_response: {
      exit_code: 0,
      output: "3.0.dev\nsrc/order_plan.py:36:class ResourceOrderConflictWarning(RuntimeWarning):\nsrc/order_plan.py:145: ResourceOrderConflictWarning,",
    },
  }, { PLUGIN_DATA: fx.data });
  assert.equal(result.stdout, "");
});

test("a typed behavioral warning with a concrete ordering-conflict message arms", async () => {
  const fx = fixture();
  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "typed-warning-conflict",
    tool_name: "exec_command",
    tool_input: { cmd: "python repro_order.py" },
    tool_response: {
      exit_code: 0,
      output: "WARN: ResourceOrderConflictWarning 'Detected duplicate resources in an opposite order: addon.js core.js'",
    },
  }, { PLUGIN_DATA: fx.data });
  assert.match(result.stdout, /Behavioral failure observed/iu);
});

test("a different failing repro cannot reset the diagnostic or recovery budget", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "monotonic-probe";
  const warningOutput = "WARNING: Detected duplicate Media files in an opposite order";
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: "python first_repro.py" },
    tool_response: { exit_code: 0, output: warningOutput },
  }, env);
  for (let index = 0; index < 5; index += 1) {
    await runHook("post", {
      cwd: fx.root, session_id: session, tool_name: "exec_command",
      tool_input: { cmd: `git status --short # ${index}` },
      tool_response: { exit_code: 0, output: "diagnostic" },
    }, env);
  }
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: "python second_repro.py" },
    tool_response: { exit_code: 0, output: warningOutput },
  }, env);
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: "git diff --stat" },
    tool_response: { exit_code: 0, output: "diagnostic" },
  }, env);
  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: "git status --short" },
  }, env)).stdout);
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
});

test("a rejected contract cannot release an explicit no-network task to download a future implementation", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  const transcriptPath = join(fx.root, "claude-parent-transcript.jsonl");
  writeFileSync(transcriptPath, `${JSON.stringify({
    type: "user",
    userType: "external",
    message: {
      role: "user",
      content: "Fix the historical issue locally. Do NOT use web search, WebFetch, or any external network to look up known fixes.",
    },
  })}\n`);
  await runHook("post", {
    cwd: fx.root, session_id: "sealed-task", transcript_path: transcriptPath,
    tool_name: "exec_command",
    tool_input: { cmd: "python -m pytest test/regression_test.py" },
    tool_response: { exit_code: 1, output: "FAILED test/regression_test.py::test_boundary" },
  }, env, "claude");

  mkdirSync(join(fx.root, ".behavioral-regression"));
  const invalidContract = join(fx.root, ".behavioral-regression", "BR-20260811-invalid.json");
  writeFileSync(invalidContract, "{}\n");
  await runHook("post", {
    cwd: fx.root, session_id: "sealed-task", transcript_path: transcriptPath,
    tool_name: "Write", tool_input: { file_path: invalidContract },
  }, env, "claude");

  for (const command of [
    "pip download future-package==9.9",
    "python -c 'import urllib.request; urllib.request.urlopen(\"https://example.com\")'",
  ]) {
    const denied = parseOutput((await runHook("pre", {
      cwd: fx.root, session_id: "sealed-task", transcript_path: transcriptPath,
      tool_name: "Bash", tool_input: { command },
    }, env, "claude")).stdout);
    assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
    assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /external network.*task|future implementation/iu);
  }

  for (const toolName of ["WebSearch", "WebFetch"]) {
    const denied = parseOutput((await runHook("pre", {
      cwd: fx.root, session_id: "sealed-task", transcript_path: transcriptPath,
      tool_name: toolName, tool_input: { query: "future package ordering fix" },
    }, env, "claude")).stdout);
    assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  }
});

test("frozen verification assets are rejected before a write can invalidate receipts", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "frozen-verification";
  await runHook("post", {
    cwd: fx.root, session_id: session, tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  const before = await runHook("failure", {
    cwd: fx.root, session_id: session, tool_name: "exec_command",
    tool_input: { cmd: "node test/primary.mjs" },
    tool_response: { exit_code: 1, output: "PRIMARY_REPRO" },
  }, env);
  assert.match(before.stdout, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);

  const denied = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: session, tool_name: "Edit",
    tool_input: { file_path: join(fx.root, "test", "primary.mjs"), new_string: "changed" },
  }, env)).stdout);
  assert.equal(denied?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(denied?.hookSpecificOutput?.permissionDecisionReason ?? "", /verification assets are frozen|replan.*baseline/iu);
});

test("a successful wrapper still arms when an inner probe emits a phase-specific REPRO signature", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "wrapped-repro",
    tool_name: "Bash",
    tool_input: { command: "for probe in test/*.cjs; do node \"$probe\"; echo \"exit: $?\"; done" },
    tool_response: { exit_code: 0, output: "BOUNDARY_OK\nPRIMARY_PARTIAL_REPRO populated peer was discarded\nexit: 1" },
  }, env);
  const edit = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "wrapped-repro",
    tool_name: "Edit",
    tool_input: { file_path: "src/align-columns.cjs", new_string: "fixed" },
  }, env)).stdout);
  assert.equal(edit?.hookSpecificOutput?.permissionDecision, "deny");
});

test("a successful diagnostic wrapper arms when it catches and prints an exception class", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "caught-error",
    tool_name: "Bash",
    tool_input: { command: "python -c \"run_boundary_probe()\"" },
    tool_response: { exit_code: 0, output: "boundary error: InconsistentStateError invalid empty input" },
  }, env);
  const edit = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: "caught-error",
    tool_name: "Edit",
    tool_input: { file_path: "src/converter.py", new_string: "fixed" },
  }, env)).stdout);
  assert.equal(edit?.hookSpecificOutput?.permissionDecision, "deny");
});

test("probe gate stays idle for missing tools, timeouts, and clean probes", async () => {
  for (const [session, response] of [
    ["missing", { exit_code: 127, output: "pytest: command not found" }],
    ["timeout", { interrupted: true, output: "timeout exceeded" }],
    ["clean", { exit_code: 0, output: "1 passed" }],
  ]) {
    const fx = emptyFixture();
    const env = { PLUGIN_DATA: fx.data };
    await runHook("post", {
      cwd: fx.root,
      session_id: session,
      tool_name: "exec_command",
      tool_input: { cmd: "python -m pytest test/regression_test.py" },
      tool_response: response,
    }, env);
    const edit = await runHook("pre", {
      cwd: fx.root,
      session_id: session,
      tool_name: "Edit",
      tool_input: { file_path: "src/normalize.py", new_string: "fixed" },
    }, env);
    assert.equal(edit.stdout, "", `${session} must not arm the gate`);
  }
});

test("probe gate ignores framework setup failures without an explicit behavioral marker", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  const event = {
    cwd: fx.root,
    session_id: "setup-failure",
    tool_name: "Bash",
    tool_input: { command: "python /tmp/repro.py" },
    tool_response: {
      exit_code: 1,
      output: "Traceback (most recent call last):\nframework.ConfigurationError: Requested setting LOCALE, but settings are not configured.",
    },
  };
  await runHook("post", event, env);
  const production = await runHook("pre", {
    cwd: fx.root,
    session_id: "setup-failure",
    tool_name: "Edit",
    tool_input: { file_path: join(fx.root, "src", "subject.js") },
  }, env);
  assert.equal(production.stdout, "", production.stderr);
});

test("a clean replay of the same probe clears a stale candidate gate", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  const event = {
    cwd: fx.root,
    session_id: "replay",
    tool_name: "exec_command",
    tool_input: { cmd: "node test/reproduction.mjs" },
  };
  await runHook("post", { ...event, tool_response: { exit_code: 1, output: "AssertionError: mismatch" } }, env);
  await runHook("post", { ...event, tool_response: { exit_code: 0, output: "REPRODUCTION_OK" } }, env);
  const edit = await runHook("pre", {
    cwd: fx.root,
    session_id: "replay",
    tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env);
  assert.equal(edit.stdout, "");
});

test("version-control output containing failure literals is not a behavioral probe", async () => {
  const fx = emptyFixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "diff-output",
    tool_name: "exec_command",
    tool_input: { cmd: "git status --short .behavioral-regression && git diff" },
    tool_response: { exit_code: 0, output: "+ PRIMARY_REGRESSION_REPRO\n+ AssertionError: mismatch" },
  }, env);
  const edit = await runHook("pre", {
    cwd: fx.root,
    session_id: "diff-output",
    tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env);
  assert.equal(edit.stdout, "");
});

test("a bound contract releases production only after every BEFORE receipt is frozen", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const session = "before-gate";
  await runHook("post", {
    cwd: fx.root,
    session_id: session,
    tool_name: "exec_command",
    tool_input: { cmd: "node test/primary.mjs" },
    tool_response: { exit_code: 1, output: "PRIMARY_REPRO" },
  }, env);
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env);

  const blocked = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env)).stdout);
  assert.equal(blocked?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(blocked?.hookSpecificOutput?.permissionDecisionReason ?? "", /BEFORE/iu);

  const destructiveShell = parseOutput((await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Bash",
    tool_input: { command: "dd if=/dev/null of=src/normalize.js" },
  }, env)).stdout);
  assert.equal(destructiveShell?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(destructiveShell?.hookSpecificOutput?.permissionDecisionReason ?? "", /BEFORE proof is incomplete/iu);

  const observations = [
    ["node test/primary.mjs", 1, "PRIMARY_REPRO"],
    ["node test/boundary.mjs", 0, "BOUNDARY_OK"],
    ["node test/representation.mjs", 1, "REPRESENTATION_REPRO"],
    ["node test/compat.mjs", 0, "COMPAT_OK"],
  ];
  const receipts = [];
  for (const [cmd, exitCode, output] of observations) {
    const observed = await runHook("post", {
      cwd: fx.root,
      session_id: session,
      tool_name: "exec_command",
      tool_input: { cmd },
      tool_response: { exit_code: exitCode, output },
    }, env);
    receipts.push(observed.stdout.match(/Receipt (BR-R[0-9]+)/u)?.[1]);
  }
  assert.equal(receipts.every(Boolean), true);
  const contract = JSON.parse(readFileSync(fx.path, "utf8"));
  for (const [index, receipt] of receipts.entries()) contract.cases[index].receipts.before = receipt;
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: session, tool_name: "Write", tool_input: { file_path: fx.path } }, env);

  const opaqueShell = parseOutput((await runHook("pre", {
    cwd: join(fx.root, "test"),
    session_id: session,
    tool_name: "Bash",
    tool_input: { command: "sed -i 's/COMPAT_OK/WEAKENED/' compat.mjs" },
  }, env)).stdout);
  assert.equal(opaqueShell?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(opaqueShell?.hookSpecificOutput?.permissionDecisionReason ?? "", /shell mutation.*file-edit tool/iu);

  const allowed = await runHook("pre", {
    cwd: fx.root,
    session_id: session,
    tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "fixed" },
  }, env);
  assert.equal(allowed.stdout, "");
});

test("Claude failure and Codex PostToolUse shapes both record a signed BEFORE receipt", async () => {
  for (const variant of ["claude", "codex"]) {
    const fx = fixture();
    const env = { PLUGIN_DATA: fx.data, AI_EXPERTS_SESSION_ID: `${variant}-session` };
    await runHook("post", { cwd: fx.root, session_id: `${variant}-session`, tool_name: "Write", tool_input: { file_path: fx.path } }, env);
    const event = {
      cwd: fx.root,
      session_id: `${variant}-session`,
      tool_name: variant === "claude" ? "Bash" : "exec_command",
      tool_input: variant === "claude" ? { command: "node test/primary.mjs" } : { cmd: "node test/primary.mjs" },
      tool_response: variant === "claude" ? "PRIMARY_REPRO" : { exit_code: 1, output: "PRIMARY_REPRO" },
    };
    const result = await runHook(variant === "claude" ? "failure" : "post", event, env);
    assert.match(`${result.stdout}${result.stderr}`, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);
  }
});

test("a declared command followed by an exit-status echo records the underlying BEFORE receipt", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", {
    cwd: fx.root,
    session_id: "echoed-exit",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
  }, env);
  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "echoed-exit",
    tool_name: "Bash",
    tool_input: { command: 'node test/primary.mjs; echo "probe-exit=$?"' },
    tool_response: { exit_code: 0, output: "PRIMARY_REPRO\nprobe-exit=1\n" },
  }, env);
  assert.match(`${result.stdout}${result.stderr}`, /Receipt BR-R[0-9]+.*BR-C1 BEFORE.*echoed-exit-status/u);
});

test("bound missing contract fails closed while paused contract releases Stop", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  writeFileSync(fx.path, "not json\n");
  const invalid = await runHook("stop", { cwd: fx.root, session_id: "s" }, env);
  assert.match(invalid.stdout, /"decision":"block"/u);

  const paused = regressionContract();
  paused.status = "paused";
  writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  const released = await runHook("stop", { cwd: fx.root, session_id: "s", last_assistant_message: paused.id }, env);
  assert.equal(released.stdout, "");
  const productionEdit = parseOutput((await runHook("pre", {
    cwd: fx.root, session_id: "s", tool_name: "Edit",
    tool_input: { file_path: "src/normalize.js", new_string: "bypass" },
  }, env)).stdout);
  assert.equal(productionEdit?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(productionEdit?.hookSpecificOutput?.permissionDecisionReason ?? "", /paused.*reopen|resume.*epoch/iu);
});

test("manifest hooks omit prompt interception, gate file and shell mutation, and Codex commands carry provenance env", () => {
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const claude = JSON.parse(execFileSync("cat", [join(pluginRoot, "hooks", "claude.json")], { encoding: "utf8" }));
  const codex = JSON.parse(execFileSync("cat", [join(pluginRoot, "hooks", "codex.json")], { encoding: "utf8" }));
  for (const manifest of [claude, codex]) {
    assert.equal("UserPromptSubmit" in manifest.hooks, false);
    assert.ok("PreToolUse" in manifest.hooks);
    assert.match(manifest.hooks.PreToolUse[0].matcher, /Edit/u);
    assert.match(manifest.hooks.PreToolUse[0].matcher, /Bash/u);
    assert.match(manifest.hooks.PreToolUse[0].matcher, /exec_command/u);
    for (const event of ["SessionStart", "PostToolUse", "Stop", "SubagentStop"]) assert.ok(event in manifest.hooks, event);
    assert.match(JSON.stringify(manifest.hooks.SubagentStop), /subagent-stop/u);
  }
  assert.ok("PostToolUseFailure" in claude.hooks);
  assert.ok("SubagentStart" in claude.hooks);
  const behavioralPre = claude.hooks.PreToolUse.find((entry) => /\bpre claude\b/u.test(JSON.stringify(entry)));
  for (const tool of ["Read", "Grep", "Glob", "Agent", "Task", "Skill"]) assert.match(behavioralPre.matcher, new RegExp(tool, "u"));
  assert.ok(claude.hooks.PreToolUse.some((entry) => /Agent|Task/u.test(entry.matcher) && /review-pre/u.test(JSON.stringify(entry))));
  const reviewPre = claude.hooks.PreToolUse.find((entry) => /review-pre/u.test(JSON.stringify(entry)));
  assert.match(reviewPre.matcher, /Read/u);
  assert.match(reviewPre.matcher, /Grep/u);
  assert.match(reviewPre.matcher, /WebSearch/u);
  assert.match(JSON.stringify(claude.hooks.SubagentStart), /review-start/u);
  assert.equal("PostToolUseFailure" in codex.hooks, false);
  assert.equal("SubagentStart" in codex.hooks, false);
  const commands = JSON.stringify(codex);
  assert.match(commands, /AI_EXPERTS_SESSION_ID/u);
  assert.match(commands, /AI_EXPERTS_TRIGGER_FROM/u);
});

test("timeouts and missing commands are not classified as behavioral failures", () => {
  assert.equal(commandObservation({ tool_response: { exit_code: 127, output: "tool: command not found" } }).outcome, "missing");
  assert.equal(commandObservation({ tool_response: { interrupted: true, output: "timeout exceeded" } }).outcome, "timeout");
});

test("a diagnostic exit echo restores the declared command and its real outcome", () => {
  const observed = commandObservation({
    tool_name: "Bash",
    tool_input: { command: 'node test/primary.mjs; echo "probe-exit=$?"' },
    tool_response: { exit_code: 0, output: "PRIMARY_REPRO\nprobe-exit=1\n" },
  });
  assert.equal(observed.command, "node test/primary.mjs");
  assert.equal(observed.outcome, "failure");
  assert.equal(observed.outcomeBasis, "echoed-exit-status");
});

test("Claude successful object responses without exit codes remain observable", () => {
  const prior = process.env.PLUGIN_ROOT;
  delete process.env.PLUGIN_ROOT;
  try {
    assert.equal(commandObservation({ tool_response: { stdout: "BOUNDARY_OK", stderr: "" } }).outcome, "success");
  } finally {
    if (prior === undefined) delete process.env.PLUGIN_ROOT;
    else process.env.PLUGIN_ROOT = prior;
  }
});

test("Codex canonical Bash hooks record literal-oracle receipts when exit status is unavailable", async () => {
  const fx = fixture();
  const env = {
    PLUGIN_DATA: fx.data,
    PLUGIN_ROOT: fileURLToPath(new URL("..", import.meta.url)),
    AI_EXPERTS_SESSION_ID: "codex-canonical-session",
  };
  await runHook("post", {
    cwd: fx.root,
    session_id: "codex-canonical-session",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
    tool_response: "Done!",
  }, env);

  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "codex-canonical-session",
    tool_name: "Bash",
    tool_input: { command: "node test/primary.mjs" },
    tool_response: "PRIMARY_REPRO legacy normalization is broken\n",
  }, env);

  assert.match(`${result.stdout}${result.stderr}`, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);
  assert.match(`${result.stdout}${result.stderr}`, /literal-oracle/u);
});
