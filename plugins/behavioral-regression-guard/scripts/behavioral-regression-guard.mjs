#!/usr/bin/env node

import { relative, resolve } from "node:path";

import {
  commandObservation,
  contextOutput,
  extractAgentId,
  extractAgentPrompt,
  extractAssistantMessage,
  extractCommandCwd,
  extractCwd,
  extractFileTargets,
  extractLatestUserTask,
  extractSessionId,
  extractShellCommand,
  extractToolName,
  extractToolInput,
  extractToolUseId,
  hasShellMutationIntent,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { activeProbeCandidate, armedProbeRollbackCandidates, clearProbeCandidate, isArmedProbeRollbackCommand, isManagedProofAsset, isManagedProofCommand, managedProofCommandAssets, managedProofDirectRecovery, observeProbeCandidate, prepareProbeCandidate, recordProbeRecoveryDenial, targetRelativePaths } from "./lib/probe-gate.mjs";
import {
  beforeEvidenceFindings,
  bindContractAfterMutation,
  bindIndependentReviewer,
  completionFindings,
  discoverContracts,
  independentReviewChallengeDrafts,
  independentReviewChallengeIds,
  independentReviewDimensions,
  independentReviewerBinding,
  observeCommand,
  observeIndependentReview,
  observeIndependentReviewerAnchor,
  requiresIndependentReview,
  refreshBinding,
  reserveIndependentReview,
} from "./lib/workflow.mjs";

function warn(message) { process.stderr.write(`[behavioral-regression-guard] ${message}\n`); }

const SESSION_CONTEXT = "Reproducible-fix evidence: `$behavioral-regression`.";

function taskForbidsExternalNetwork(task) {
  return /\b(?:do\s+not|don't|must\s+not|never)\b[^\n]{0,120}\b(?:external\s+network|web\s+search|webfetch|network)\b/iu.test(String(task ?? ""));
}

function commandAcquiresExternalSource(command) {
  const value = String(command ?? "");
  return /(?:^|[\s;&|])(?:curl|wget)(?:\s|$)/iu.test(value)
    || /\b(?:python\s+-m\s+)?pip(?:3)?\s+download\b/iu.test(value)
    || /\bgit\s+(?:clone|fetch|pull|ls-remote)\b/iu.test(value)
    || /\b(?:urllib\.request|urlopen\s*\(|requests\.(?:get|post)\s*\()/iu.test(value);
}

function isExternalNetworkTool(name) {
  return /^(?:WebFetch|WebSearch)$/u.test(String(name ?? ""));
}

function isBehavioralRegressionSkill(event) {
  if (String(extractToolName(event)) !== "Skill") return false;
  const input = extractToolInput(event);
  const name = input?.skill ?? input?.skill_name ?? input?.skillName ?? input?.name;
  return /(?:^|:)behavioral-regression$/u.test(String(name ?? ""));
}

function isBehavioralRegressionContractReference(event) {
  if (String(extractToolName(event)) !== "Read") return false;
  const input = extractToolInput(event);
  const path = input?.file_path ?? input?.filePath ?? input?.path;
  if (typeof path !== "string") return false;
  return resolve(extractCwd(event), path).replaceAll("\\", "/") === "/plugins/behavioral-regression-guard/skills/behavioral-regression/references/contract.md";
}

async function runSession(event) {
  const contracts = discoverContracts(extractCwd(event)).filter((item) => item.checked.valid && ["open", "paused"].includes(item.checked.contract.status));
  const lines = [SESSION_CONTEXT];
  if (contracts.length > 0) {
    lines.push("Resumable contracts (discovery does not activate them):");
    for (const item of contracts) lines.push(`- ${item.checked.contract.id} (${item.checked.contract.status}, epoch ${item.checked.contract.epoch})`);
  }
  writeJson(contextOutput("SessionStart", lines.join("\n")));
}

function relativePath(root, path) {
  return relative(root, resolve(path)).replaceAll("\\", "/") || ".";
}

function touchedDeclaredPaths(root, paths, declared) {
  return [...new Set(paths.flatMap((path) => targetRelativePaths(path, root)).filter((path) => declared.has(path)))];
}

function prioritizedInvalidFindings(findings) {
  const priorities = [
    /surface\.orderingPolicy/iu,
    /scope\.supersededAssertions|Git-baseline.*expected/iu,
    /ordering scenarios|independent-pair|independent-chains/iu,
    /surface\.semantics/iu,
    /surface\.components/iu,
  ];
  const rank = (value) => {
    const index = priorities.findIndex((pattern) => pattern.test(value));
    return index < 0 ? priorities.length : index;
  };
  return [...findings].sort((left, right) => rank(left) - rank(right));
}

function orderingAuthoringRecovery(invalidContract) {
  const findings = invalidContract.checked.findings ?? [];
  if (!findings.some((finding) => /surface\.orderingPolicy|scope\.supersededAssertions|ordering scenarios/iu.test(finding))) return "";
  return " Ordering authoring blocker: under stable-topological-layers, freeze every current indegree-zero node, emit the whole layer in first-seen order, and only then remove that layer and unlock the next one. If the derived scenario changes a matching Git-baseline expectation, declare that assertion as metadata in scope.supersededAssertions and treat it as superseded, not preserved or protected by the compatibility invariant. Do not edit the project regression file; the managed bundle provides RED and the regression path must remain identical to Git baseline.";
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function invalidContractAllowedPaths(root, invalidContract) {
  if (!invalidContract) return [];
  return [
    relativePath(root, invalidContract.path),
    ...(invalidContract.checked.contract?.scope?.verificationPaths ?? []),
  ];
}

function probeRollbackRecovery(root, sessionId, invalidContract) {
  if (!invalidContract) return null;
  const candidates = armedProbeRollbackCandidates({
    cwd: root,
    sessionId,
    allowedPaths: invalidContractAllowedPaths(root, invalidContract),
  });
  if (candidates.length === 0) return null;
  return {
    candidates,
    command: `rm -f -- ${candidates.map((path) => shellQuote(resolve(root, path))).join(" ")}`,
  };
}

function probeRecoveryInstruction(cwd, denialCount, platform, sessionId = null, boundInvalid = null) {
  const invalidContract = boundInvalid ?? discoverContracts(cwd).find((item) => item.checked.valid === false);
  if (invalidContract) {
    const contractPath = relativePath(cwd, invalidContract.path);
    const repairTargets = [
      contractPath,
      ...(invalidContract.checked.contract?.scope?.verificationPaths ?? [])
        .filter((path) => isManagedProofAsset(resolve(cwd, path), cwd)),
    ];
    const repairTargetList = [...new Set(repairTargets)].map((path) => `\`${path}\``).join(", ");
    const findings = prioritizedInvalidFindings(invalidContract.checked.findings ?? []).slice(0, 3).join("; ").slice(0, 700);
    const orderingRecovery = orderingAuthoringRecovery(invalidContract);
    const rollback = probeRollbackRecovery(cwd, sessionId, invalidContract);
    const writeAction = platform === "codex" ? "apply_patch" : "Edit or Write";
    const escalation = denialCount >= 5
      ? `Recovery denial ${denialCount}. blockingContract: observedFacts=${denialCount} inert recovery attempts; unblockWhen=repair one of ${repairTargetList}; recovery=repair the listed findings without another Shell/Read attempt.`
      : "The denied shell command did not execute.";
    const nextTool = denialCount >= 3 ? ` The only accepted repair targets for ${writeAction} are ${repairTargetList}.` : "";
    const orderingSequence = orderingRecovery
      ? " If the existing bundle still encodes another ordering policy, repair that declared bundle first, then synchronize the contract."
      : "";
    const rollbackRecovery = rollback
      ? ` To restore post-probe generated files, the only accepted shell rollback is: \`${rollback.command}\`.`
      : "";
    return `An existing behavioral contract is invalid. ${escalation}${nextTool}${orderingRecovery}${orderingSequence}${rollbackRecovery} Use ${writeAction} on one of ${repairTargetList}; do not create another bundle or retry other Shell/Read commands. Current findings: ${findings}`;
  }
  if (denialCount >= 3) {
    const blocking = denialCount >= 5
      ? ` blockingContract: observedFacts=${denialCount} consecutive inert recovery attempts; unblockWhen=create or repair the managed bundle with the named file-writing tool; recovery=execute the supplied tool card now.`
      : "";
    if (platform === "codex") {
      return `Recovery denial ${denialCount}. The only accepted next tool is apply_patch. Apply one patch that creates \`.behavioral-regression/BR-<id>/bundle.<language>\`; do not emit more analysis or call Shell, Read, agents, or another Skill.${blocking}`;
    }
    return `Recovery denial ${denialCount}. The only accepted next tool is Write (or Edit when the managed bundle already exists). Call it now with input \`{"file_path":"<repo-root>/.behavioral-regression/BR-<id>/bundle.<language>","content":"<complete proof source>"}\`; do not emit more analysis or call Bash, Read, Grep, agents, or another Skill.${blocking}`;
  }
  if (denialCount >= 2) {
    const writeAction = platform === "codex" ? "apply_patch" : "Write or Edit";
    return `The previous denied shell command did not execute. Stop searching and retrying Shell; use ${writeAction} to create or repair the managed proof now.`;
  }
  return "Create a proof under `.behavioral-regression/BR-<id>/`, run that managed proof with one direct command, then bind its v11 contract.";
}

async function runPre(event) {
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);
  const platform = process.argv[3];
  const toolName = extractToolName(event);
  const paths = extractFileTargets(event);
  const shellCommand = extractShellCommand(event);
  const task = extractLatestUserTask(event);
  if (taskForbidsExternalNetwork(task)
    && (isExternalNetworkTool(extractToolName(event)) || commandAcquiresExternalSource(shellCommand))) {
    writeJson(preToolDeny("[Behavioral Regression Guard] The original task forbids external network access. A future implementation or known fix cannot be used as causal evidence; derive the behavior from the sealed local workspace."));
    return;
  }
  const shellMutation = hasShellMutationIntent(shellCommand);
  if (shellCommand) prepareProbeCandidate({ cwd: extractCommandCwd(event), sessionId, command: shellCommand });
  const pendingProbe = activeProbeCandidate({ cwd, sessionId });
  if (pendingProbe.kind === "active" && isBehavioralRegressionSkill(event)) return;
  if (pendingProbe.kind === "active" && isBehavioralRegressionContractReference(event)) return;
  const discoveredInvalidContract = pendingProbe.kind === "active"
    ? discoverContracts(cwd).find((item) => item.checked.valid === false)
    : null;
  const preflightLive = pendingProbe.kind === "active" && !discoveredInvalidContract
    ? refreshBinding({ cwd, sessionId })
    : null;
  const invalidContract = discoveredInvalidContract ?? (preflightLive?.kind === "invalid" && preflightLive.state?.contractPath
    ? {
      path: preflightLive.state.contractPath,
      checked: { contract: preflightLive.contract, findings: preflightLive.findings ?? [] },
    }
    : null);
  const rollback = pendingProbe.kind === "active"
    ? probeRollbackRecovery(pendingProbe.repoRoot, sessionId, invalidContract)
    : null;
  if (shellCommand && rollback && isArmedProbeRollbackCommand(
    shellCommand,
    extractCommandCwd(event),
    pendingProbe.repoRoot,
    rollback.candidates,
  )) return;
  const terminalRecovery = pendingProbe.kind === "active"
    && Number(pendingProbe.probe?.commandsSinceArm ?? 0) >= 6
    && Number(pendingProbe.probe?.recoveryDenials ?? 0) >= 3;
  if (terminalRecovery) {
    const commandCwd = extractCommandCwd(event);
    if (shellCommand && isManagedProofCommand(shellCommand, commandCwd, pendingProbe.repoRoot)) {
      const declaredVerification = new Set((invalidContract?.checked.contract?.scope?.verificationPaths ?? [])
        .filter((path) => isManagedProofAsset(resolve(pendingProbe.repoRoot, path), pendingProbe.repoRoot)));
      const assets = managedProofCommandAssets(shellCommand, commandCwd, pendingProbe.repoRoot);
      if (!invalidContract || (assets.length > 0 && assets.every((path) => declaredVerification.has(path)))) return;
    }
    const directRecovery = shellCommand
      ? managedProofDirectRecovery(shellCommand, commandCwd, pendingProbe.repoRoot)
      : null;
    if (directRecovery) {
      const denialCount = recordProbeRecoveryDenial({ cwd: commandCwd, sessionId });
      writeJson(preToolDeny(`[Behavioral Regression Guard] Recovery denial ${denialCount}. This command did not execute because a managed proof must be the whole shell command; the trailing \`; echo ...\` wrapper is forbidden. Run exactly: \`${directRecovery}\`. Do not edit the proof again merely to retry it.`));
      return;
    }
    const fileWrite = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/u.test(String(toolName));
    const invalidRepairPaths = invalidContract
      ? new Set([
        relativePath(pendingProbe.repoRoot, invalidContract.path),
        ...(invalidContract.checked.contract?.scope?.verificationPaths ?? [])
          .filter((path) => isManagedProofAsset(resolve(pendingProbe.repoRoot, path), pendingProbe.repoRoot)),
      ])
      : null;
    const managedWrite = fileWrite
      && paths.length > 0
      && paths.every((path) => isManagedProofAsset(path, pendingProbe.repoRoot)
        && (!invalidRepairPaths || invalidRepairPaths.has(relativePath(pendingProbe.repoRoot, path))));
    if (!managedWrite) {
      const denialCount = recordProbeRecoveryDenial({ cwd: commandCwd, sessionId });
      const recovery = probeRecoveryInstruction(pendingProbe.repoRoot, denialCount, platform, sessionId, invalidContract);
      writeJson(preToolDeny(`[Behavioral Regression Guard] Terminal behavioral-proof recovery is active. This tool did not execute. ${recovery}`));
      return;
    }
  }
  if (shellCommand && !shellMutation) {
    if (pendingProbe?.kind === "active" && Number(pendingProbe.probe?.commandsSinceArm ?? 0) >= 6) {
      const commandCwd = extractCommandCwd(event);
      if (isManagedProofCommand(shellCommand, commandCwd, pendingProbe.repoRoot)) return;
      const denialCount = recordProbeRecoveryDenial({ cwd: commandCwd, sessionId });
      const recovery = probeRecoveryInstruction(pendingProbe.repoRoot, denialCount, platform, sessionId, invalidContract);
      writeJson(preToolDeny(`[Behavioral Regression Guard] The post-failure diagnostic budget is exhausted. ${recovery} Unrelated, chained, redirected, or inline-code shell commands are denied.`));
    }
    return;
  }
  if (paths.length === 0 && !shellMutation) return;
  const live = preflightLive ?? refreshBinding({ cwd, sessionId });
  if (live.kind === "inactive") {
    const regressionPaths = new Set(live.contract?.scope?.regressionPaths ?? []);
    const touchedRegression = touchedDeclaredPaths(live.repoRoot, paths, regressionPaths);
    const shellRegression = shellMutation ? [...regressionPaths].filter((path) => shellCommand.includes(path)) : [];
    if (touchedRegression.length > 0 || shellRegression.length > 0) {
      const targets = [...new Set([...touchedRegression, ...shellRegression])];
      writeJson(preToolDeny(`[Behavioral Regression Guard] Project regression files are immutable Git-baseline evidence; scope.supersededAssertions is metadata and cannot authorize edits to ${targets.join(", ")}. Put executable RED/GREEN evidence in the managed bundle.`));
      return;
    }
    if (shellMutation) {
      writeJson(preToolDeny("[Behavioral Regression Guard] Shell mutation is denied for an inactive contract. Use an observable file-edit tool after reopening and recapturing the evidence workflow."));
      return;
    }
    const frozenVerification = new Set([
      ...(live.contract?.scope?.verificationPaths ?? []),
      ...(live.contract?.scope?.regressionPaths ?? []),
    ]);
    const touchedVerification = touchedDeclaredPaths(live.repoRoot, paths, frozenVerification);
    const shellVerification = shellMutation ? [...frozenVerification].filter((path) => shellCommand.includes(path)) : [];
    if (live.contract?.status === "closed" && (touchedVerification.length > 0 || shellVerification.length > 0)) {
      const targets = [...new Set([...touchedVerification, ...shellVerification])];
      writeJson(preToolDeny(`[Behavioral Regression Guard] Closed contract verification is frozen; cannot edit ${targets.join(", ")}. Reopen a new epoch from the production baseline before changing proof or project regression assets.`));
      return;
    }
    const production = new Set(live.contract?.scope?.productionPaths ?? []);
    const touchedProduction = touchedDeclaredPaths(live.repoRoot, paths, production);
    const shellProduction = shellMutation ? [...production].filter((path) => shellCommand.includes(path)) : [];
    const shellTouchesProduction = shellProduction.length > 0;
    if (touchedProduction.length > 0 || shellTouchesProduction) {
      const targets = [...new Set([...touchedProduction, ...shellProduction])];
      writeJson(preToolDeny(`[Behavioral Regression Guard] ${live.contract.status} contract cannot authorize production edits to ${targets.join(", ")}; reopen it with the next epoch and recapture the proof workflow before editing.`));
    }
    return;
  }
  if (live.kind === "active" || live.kind === "invalid") {
    const root = live.repoRoot;
    const regressionPaths = new Set(live.contract?.scope?.regressionPaths ?? []);
    const touchedRegression = touchedDeclaredPaths(root, paths, regressionPaths);
    const shellRegression = shellMutation ? [...regressionPaths].filter((path) => shellCommand.includes(path)) : [];
    if (touchedRegression.length > 0 || shellRegression.length > 0) {
      const targets = [...new Set([...touchedRegression, ...shellRegression])];
      writeJson(preToolDeny(`[Behavioral Regression Guard] Project regression files are immutable Git-baseline evidence; scope.supersededAssertions is metadata and cannot authorize edits to ${targets.join(", ")}. Put executable RED/GREEN evidence in the managed bundle.`));
      return;
    }
    if (live.kind === "invalid") {
      const declaredRepairPaths = new Set([
        live.state?.contractPath ? relativePath(root, live.state.contractPath) : null,
        ...(live.contract?.scope?.verificationPaths ?? [])
          .filter((path) => isManagedProofAsset(resolve(root, path), root)),
      ].filter(Boolean));
      const managedRepair = !shellMutation && paths.length > 0
        && paths.every((path) => {
          const identities = targetRelativePaths(path, root);
          return identities.length > 0 && identities.every((identity) => declaredRepairPaths.has(identity));
        });
      if (managedRepair) return;
      const contractPath = live.state?.contractPath
        ? relativePath(root, live.state.contractPath)
        : ".behavioral-regression/<id>.json";
      const recovery = shellMutation
        ? rollback
          ? `This shell mutation was not executed. To restore only the post-probe managed/generated files, run exactly: \`${rollback.command}\`. Otherwise use Edit or Write directly on ${contractPath}.`
          : `Shell mutation was not executed and is denied while the bound state is invalid. Use Edit or Write directly on ${contractPath} to repair the contract.`
        : rollback
          ? `This write did not execute. The only valid workspace rollback is \`${rollback.command}\`; run it exactly before retrying ${contractPath}. Otherwise use Edit or Write only on that contract or its existing managed bundle.`
          : `Use Edit or Write directly on ${contractPath} or its existing managed bundle to repair the contract.`;
      writeJson(preToolDeny(`[Behavioral Regression Guard] Bound proof state is invalid: ${(live.findings ?? ["unknown state error"]).join("; ")}. ${recovery}`));
      return;
    }
    if (shellMutation) {
      const before = beforeEvidenceFindings(live);
      const reason = before.length > 0
        ? `BEFORE proof is incomplete: ${before.join("; ")}. Record every declared baseline receipt before production edits.`
        : "Shell mutation is not authorized by a bound contract; use an observable file-edit tool for a declared production path.";
      writeJson(preToolDeny(`[Behavioral Regression Guard] ${reason}`));
      return;
    }
    const verificationPaths = live.contract?.scope?.verificationPaths ?? [];
    const frozenVerification = new Set([
      ...verificationPaths,
      ...(live.contract?.scope?.regressionPaths ?? []),
    ]);
    const touchedVerification = paths
      .map((path) => relativePath(root, path))
      .filter((path) => frozenVerification.has(path));
    const shellVerification = shellMutation
      ? [...frozenVerification].filter((path) => shellCommand.includes(path))
      : [];
    if (live.kind === "active" && live.run?.verificationFingerprint
      && (touchedVerification.length > 0 || shellVerification.length > 0)) {
      const targets = [...new Set([...touchedVerification, ...shellVerification])];
      writeJson(preToolDeny(`[Behavioral Regression Guard] Verification assets are frozen after the first BEFORE receipt; cannot edit ${targets.join(", ")}. Restore the production baseline and replan the contract before revising proof or regression assets.`));
      return;
    }
    const declaredProofPaths = new Set([
      live.state?.contractPath ? relativePath(root, live.state.contractPath) : null,
      ...verificationPaths,
    ].filter(Boolean));
    const nonProof = paths.filter((path) => {
      const identities = targetRelativePaths(path, root);
      return identities.length === 0 || !identities.every((identity) => declaredProofPaths.has(identity));
    });
    if (nonProof.length === 0 && !shellMutation) return;
    const before = beforeEvidenceFindings(live);
    if (before.length > 0) {
      writeJson(preToolDeny(`[Behavioral Regression Guard] BEFORE proof is incomplete: ${before.join("; ")}. Record every declared baseline receipt before production edits.`));
      return;
    }
    const production = new Set(live.contract.scope.productionPaths);
    const outside = nonProof.map((path) => relativePath(root, path)).filter((path) => !production.has(path));
    if (outside.length > 0) {
      writeJson(preToolDeny(`[Behavioral Regression Guard] Production scope is frozen; add ${outside.join(", ")} to scope.productionPaths and recapture BEFORE evidence before editing.`));
    }
    return;
  }

  const candidate = pendingProbe ?? activeProbeCandidate({ cwd, sessionId });
  if (candidate.kind !== "active") return;
  const nonProof = paths.filter((path) => !isManagedProofAsset(path, candidate.repoRoot));
  if (nonProof.length === 0 && !shellMutation) return;
  writeJson(preToolDeny("[Behavioral Regression Guard] A behavioral failure probe is active. Invoke `$behavioral-regression`; create the isolated bundle under `.behavioral-regression/<id>/`, then bind `.behavioral-regression/<id>.json` and its BEFORE evidence before editing production. Do not use `/tmp` for proof assets."));
}

async function runPost(event, forceFailure = false) {
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);
  const eventName = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets(event);
  if (paths.length > 0) {
    const bound = bindContractAfterMutation({
      cwd,
      sessionId,
      touchedPaths: paths,
      reviewMode: process.argv[3] === "claude" ? "hard" : "advisory",
      taskAnchorText: extractLatestUserTask(event),
    });
    if (bound.kind === "idle") return;
    if (["bound", "replanned", "resumed"].includes(bound.kind)) {
      clearProbeCandidate({ cwd, sessionId });
      writeJson(contextOutput(eventName, `[Behavioral Regression Guard] ${bound.kind === "bound" ? "Bound" : bound.kind === "replanned" ? "Replanned" : "Resumed"} ${bound.contract.id}; plan ${bound.run.planDigest.slice(0, 12)}; ${bound.active ? "capture all BEFORE receipts before changing production" : `status ${bound.contract.status} releases the workflow`}.`));
    } else writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Contract activation rejected: ${(bound.findings ?? []).join("; ")}`));
    return;
  }
  const command = extractShellCommand(event);
  if (!command) return;
  const observed = commandObservation(event, forceFailure);
  const result = observeCommand({ cwd: extractCommandCwd(event), sessionId, command: observed.command ?? command, ...observed });
  const candidate = result.kind === "idle"
    ? observeProbeCandidate({ cwd: extractCommandCwd(event), sessionId, command, ...observed })
    : { kind: "ignored" };
  if (result.kind === "recorded") {
    const details = result.receipts.map((receipt) => `${receipt.id} ${receipt.caseId} ${receipt.phase.toUpperCase()} (${receipt.outcomeBasis})`).join(", ");
    writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Receipt ${details}. Put only these exact ids into the matching contract receipt fields.`));
  } else if (result.kind === "rejected") {
    writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Evidence rejected: ${result.reason}`));
  } else if (candidate.kind === "armed") {
    writeJson(contextOutput(eventName, "[Behavioral Regression Guard] Behavioral failure observed; bind `$behavioral-regression` proof before production edits."));
  } else if (candidate.kind === "reminder") {
    writeJson(contextOutput(eventName, "[Behavioral Regression Guard] Behavioral failure is still active after continued diagnosis; bind `$behavioral-regression` to freeze the causal proof before proceeding."));
  } else if (candidate.kind === "violation") {
    writeJson(contextOutput(eventName, `[Behavioral Regression Guard] The probe succeeded only after the frozen workspace changed: ${candidate.findings.join("; ")}. Restore the pre-probe workspace before binding a contract.`));
  }
}

function reviewRequest(prompt) {
  const match = String(prompt ?? "").match(/(?:^|\n)BR_REVIEW_REQUEST\s+(BR-[A-Za-z0-9-]+)\s+(oracle|patch)(?:\n|$)/u);
  return match ? { contractId: match[1], stage: match[2] } : null;
}

function reviewResult(message) {
  const lines = String(message ?? "").split(/\r?\n/u);
  const nonemptyLines = lines.filter((line) => line.trim().length > 0);
  const resultLines = nonemptyLines.filter((line) => line.trim().startsWith("BR_REVIEW_RESULT "));
  if (resultLines.length === 0) return null;
  const line = resultLines[0].trim();
  if (resultLines.length !== 1 || nonemptyLines.at(-1)?.trim() !== line || !line.startsWith("BR_REVIEW_RESULT ")) {
    return { __invalid: true, __reason: "BR_REVIEW_RESULT must be exactly one final line and the last non-empty line" };
  }
  try { return JSON.parse(line.slice("BR_REVIEW_RESULT ".length)); }
  catch { return { __invalid: true, __reason: "BR_REVIEW_RESULT must contain valid JSON" }; }
}

function reviewRecoveryCard(live, reservation) {
  const anchors = [...live.contract.scope.productionPaths, ...(live.contract.scope.regressionPaths ?? [])];
  return {
    contractId: live.contract.id,
    stage: reservation.stage,
    reviewNonce: reservation.nonce,
    decision: "approve|challenge",
    checkedDimensions: independentReviewDimensions(live.contract),
    checkedChallenges: independentReviewChallengeIds(live.contract),
    challengeResults: independentReviewChallengeDrafts(live.contract, reservation.stage, anchors[0]),
    counterexamples: ["describe one concrete falsification attempt"],
    evidenceAnchors: anchors,
  };
}

const REVIEW_VALUE_SHAPE_GUIDANCE = "Follow each challenge's valueMode and its slot-specific shapes. valueShape applies only to derivedExpected, contrastValueShape applies only to rejectedAlternative, and patch-stage observedValueShape applies only to observedActual; these reveal required JSON field/type structure, never hidden values. For raw-json, replace each null placeholder with a native JSON value matching that field's own shape; do not copy one slot's shape into another, and use no prose, labels, or JSON encoded inside strings. In the patch stage implementation-conforms is valid only when observedActual equals the oracle. For qualitative-string-12..1000, each field must be a descriptive JSON string containing 12..1000 characters of plain text (quoted only because the enclosing result is JSON), never an array or object, and the expected/alternative strings must differ. In the oracle stage, disposition compares your independent derivation with the contract oracle, never with the known-bad baseline implementation. If the derivation matches the contract, use contract-conforms even though the current baseline is defective. If the derivation itself disagrees, use contract-conflicts, keep that independent result in derivedExpected, put an independently rejected alternative distinct from derivedExpected in rejectedAlternative using the applicable shape, and return decision challenge. Do not guess or echo the hidden contract oracle; the hook compares derivedExpected with it mechanically.";
const REVIEW_READ_GUIDANCE = "Use Read on each exact evidencePaths entry. If a file is long or truncated, continue reading that same exact path with offset and limit until the required region is covered. Grep may be used only when the host actually exposes it. Do not simulate an unavailable Grep with Bash.";
const REVIEW_REPRESENTATION_GRAMMAR_GUIDANCE = "When a challenge includes representationGrammar, encode independently derived container names, nesting, and lengths with that exact canonical grammar; an equivalent prose label is not the same machine value. Follow source-language semantics (for example, a Python bracket comprehension is a list and a NumPy slice is an array), and make the JSON value mirror every descriptor length. For coupled-boundary, apply the grammar to both derivedExpected and rejectedAlternative. The contrast must match its advertised value shape, but it need not guess an author-selected hidden representation label.";
const REVIEW_ORDERING_POLICY_GUIDANCE = "For stable-topological-layers, freeze all currently indegree-zero nodes, emit the whole layer in first-seen order, remove that whole layer, and only then unlock and compute the next layer. The eager-first-seen contrast removes one node, recomputes the complete ready set, and chooses the globally earliest first-seen node, so an earlier newly unlocked successor may precede a later root that was already ready. In the oracle stage derive the target policy output; do not repeat the buggy baseline implementation output.";
const REVIEW_NEUTRALITY_POLICY_GUIDANCE = "For homogeneous-neutrality, let P be the populated sample and E the canonical empty contributor: F(P), F(E,P), and F(P,E) must all equal the expected populated value and representation. The aggregate-empty shortcut incorrectly returns E when either peer is E.";

function reviewGuidance(contract) {
  const guidance = [REVIEW_VALUE_SHAPE_GUIDANCE];
  if (independentReviewChallengeDrafts(contract, "oracle", contract?.scope?.productionPaths?.[0] ?? "evidence").some((item) => item.representationGrammar)) guidance.push(REVIEW_REPRESENTATION_GRAMMAR_GUIDANCE);
  if (contract?.surface?.orderingPolicy === "stable-topological-layers" || independentReviewChallengeIds(contract).some((id) => id.startsWith("ordering."))) guidance.push(REVIEW_ORDERING_POLICY_GUIDANCE);
  if (contract?.surface?.interactionModel === "homogeneous-neutrality") guidance.push(REVIEW_NEUTRALITY_POLICY_GUIDANCE);
  return guidance.join("\n");
}

function reviewRecoverySuffix(event) {
  const live = refreshBinding({ cwd: extractCwd(event), sessionId: extractSessionId(event) });
  const reservation = live.run?.reviewReservation;
  return live.kind === "active" && reservation
    ? `\n${reviewGuidance(live.contract)}\nRetry with exactly one final line:\nBR_REVIEW_RESULT ${JSON.stringify(reviewRecoveryCard(live, reservation))}`
    : "";
}

async function runReviewPre(event) {
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);
  const agentId = extractAgentId(event);
  if (agentId) {
    const bound = independentReviewerBinding({ cwd, sessionId, agentId });
    const toolName = extractToolName(event);
    if (bound.kind === "reviewer" && !/^(?:Read|Grep)$/u.test(toolName)) {
      writeJson(preToolDeny(`[Behavioral Regression Guard] this is a bounded local review: research, MCP, nested agents, skills, shell, globbing, and writes are forbidden. ${REVIEW_READ_GUIDANCE}`));
      return;
    }
    if (bound.kind === "reviewer") {
      const input = extractToolInput(event);
      const anchor = input?.file_path ?? input?.path;
      const observed = observeIndependentReviewerAnchor({ cwd, sessionId, agentId, path: anchor });
      if (observed.kind === "rejected") writeJson(preToolDeny(`[Behavioral Regression Guard] ${observed.reason}`));
      return;
    }
    const live = refreshBinding({ cwd, sessionId });
    if (live.kind === "active" && live.run?.reviewMode === "hard" && requiresIndependentReview(live.contract)) {
      writeJson(preToolDeny("[Behavioral Regression Guard] This subagent has no bound review reservation. Return to the parent without reading, writing, shell access, research, or nested delegation; the parent must finish BEFORE evidence and dispatch the exact hook-approved BR_REVIEW_REQUEST."));
    }
    return;
  }
  const request = reviewRequest(extractAgentPrompt(event));
  if (!request) return;
  const reserved = reserveIndependentReview({ cwd, sessionId, ...request, toolUseId: extractToolUseId(event) });
  if (reserved.kind === "rejected") writeJson(preToolDeny(`[Behavioral Regression Guard] independent review dispatch rejected: ${reserved.reason}`));
}

async function runReviewStart(event) {
  let request = reviewRequest(extractAgentPrompt(event));
  if (!request) {
    const live = refreshBinding({ cwd: extractCwd(event), sessionId: extractSessionId(event) });
    const reservation = live.run?.reviewReservation;
    if (live.kind === "active" && reservation?.state === "reserved") request = { contractId: reservation.contractId, stage: reservation.stage };
    else if (live.kind === "active" && live.run?.reviewMode === "hard" && requiresIndependentReview(live.contract)) {
      writeJson(contextOutput("SubagentStart", "[Behavioral Regression Guard] No bound review reservation exists. Return without reviewing or using tools; the parent must finish BEFORE evidence and obtain a hook-approved BR_REVIEW_REQUEST reservation first."));
      return;
    }
  }
  if (!request) return;
  const bound = bindIndependentReviewer({
    cwd: extractCwd(event),
    sessionId: extractSessionId(event),
    agentId: extractAgentId(event),
    ...request,
  });
  if (bound.kind !== "bound-reviewer") {
    writeJson(contextOutput("SubagentStart", `[Behavioral Regression Guard] ${bound.reason ?? "review reservation is unavailable"}. Return without reviewing.`));
    return;
  }
  const projection = bound.projection;
  const taskRequest = projection.taskAnchor?.text ?? null;
  const challengeResults = independentReviewChallengeDrafts(bound.contract, projection.stage, projection.evidencePaths[0]);
  const instructions = [
    "[Behavioral Regression Independent Reviewer] Derive the expected behavior independently; do not trust the parent contract, proof bundle, implementation proposal, or prior conclusions.",
    `contractId=${projection.contractId} stage=${projection.stage} reviewNonce=${bound.reservation.nonce}`,
    `evidencePaths=${JSON.stringify(projection.evidencePaths)}`,
    "FIRST ACTION: use Read on every exact evidencePaths entry above. If a file is long or truncated, continue with Read using offset and limit. Do not simulate an unavailable Grep with Bash. Those are the only repository paths this bounded reviewer may inspect; do not guess or search for paths.",
    `problem=${JSON.stringify(projection.problem)}`,
    ...(taskRequest ? [`taskRequest=${JSON.stringify(taskRequest)}`] : []),
    `surface=${JSON.stringify(projection.surface)}`,
    `candidateCases=${JSON.stringify(projection.candidateCases)}`,
    `challengePack=${JSON.stringify(projection.challengePack)}`,
    `checkedDimensions=${JSON.stringify(projection.dimensions)}`,
    `checkedChallenges=${JSON.stringify(projection.challengePack.map((challenge) => challenge.id))}`,
    "Treat taskRequest as the original requirement and problem/surface as claims to audit, not as authority. Challenge any contradiction or unsupported narrowing.",
    "This workflow starts from a known defect: baseline failure to implement the requested target is expected and is not by itself a reason to challenge. Challenge only a wrong expected behavior, oracle, preserved invariant, scope, or causal proof obligation.",
    "Classify baseline assertions against taskRequest: an assertion that encodes the exact target behavior being changed is a superseded candidate, not a preserved invariant. Preserve only unaffected observable behavior.",
    "This is a bounded local review. Do not start research, call MCP tools, invoke skills, dispatch agents/tasks, run shell commands, glob, or write files. Use Read on the declared anchors; use Grep only if the host exposes it.",
    projection.stage === "oracle"
      ? "Read each exact evidencePaths entry; do not search for or guess paths. In the oracle stage, inspect baseline production and project-test content only; do not use lines added during this task or .behavioral-regression proof assets as oracle authority."
      : "Read each exact evidencePaths entry; do not search for or guess paths. In the patch stage, inspect current production and every declared project-test file, compare the implementation with taskRequest and candidate cases, and address any observed suite failures; do not use .behavioral-regression proof assets as implementation evidence.",
    "For every challenge, return its concrete input and an independently derived expected result. Oracle challenge inputs intentionally omit the hook's answer; derive it rather than copying candidate claims. An approve decision requires every disposition to conform.",
    REVIEW_VALUE_SHAPE_GUIDANCE,
    ...(projection.challengePack.some((challenge) => challenge.id.startsWith("ordering.")) ? [REVIEW_ORDERING_POLICY_GUIDANCE] : []),
    "Try at least one concrete counterexample. Keep every counterexamples entry concise: 12..1000 characters. Return exactly one final line:",
    `BR_REVIEW_RESULT {"contractId":"${projection.contractId}","stage":"${projection.stage}","reviewNonce":"${bound.reservation.nonce}","decision":"approve|challenge","checkedDimensions":${JSON.stringify(projection.dimensions)},"checkedChallenges":${JSON.stringify(projection.challengePack.map((challenge) => challenge.id))},"challengeResults":${JSON.stringify(challengeResults)},"counterexamples":["concrete falsification attempt"],"evidenceAnchors":${JSON.stringify(projection.evidencePaths)}}`,
  ];
  writeJson(contextOutput("SubagentStart", instructions.join("\n")));
}

async function runSubagentStop(event) {
  const result = reviewResult(extractAssistantMessage(event));
  if (!result) {
    const live = refreshBinding({ cwd: extractCwd(event), sessionId: extractSessionId(event) });
    const reservation = live.run?.reviewReservation;
    if (live.kind === "active" && reservation && ["reserved", "bound"].includes(reservation.state)
      && (!reservation.agentId || reservation.agentId === extractAgentId(event))) {
      const card = reviewRecoveryCard(live, reservation);
      writeJson(stopDeny(`[Behavioral Regression Guard] ${reviewGuidance(live.contract)}\nFinish the independent review with exactly one final line:\nBR_REVIEW_RESULT ${JSON.stringify(card)}`));
    }
    return;
  }
  if (result.__invalid) {
    writeJson(stopDeny(`[Behavioral Regression Guard] ${result.__reason}.${reviewRecoverySuffix(event)}`));
    return;
  }
  const observed = observeIndependentReview({
    cwd: extractCwd(event),
    sessionId: extractSessionId(event),
    agentId: extractAgentId(event),
    result,
  });
  if (observed.kind === "rejected") {
    writeJson(stopDeny(`[Behavioral Regression Guard] independent review result rejected: ${observed.reason}${reviewRecoverySuffix(event)}`));
    return;
  }
  if (observed.kind === "review-recorded") {
    const disposition = observed.receipt.decision === "approve" ? "approval recorded" : "challenge recorded; the parent must replan";
    writeJson(contextOutput("SubagentStop", `[Behavioral Regression Guard] ${observed.receipt.stage} review ${observed.receipt.id}: ${disposition}.`));
  }
}

async function runStop(event) {
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);
  const live = refreshBinding({ cwd, sessionId });
  if (live.kind === "idle") return;
  const findings = completionFindings(live);
  if (findings.length === 0) return;
  const path = live.state?.contractPath ? relative(live.repoRoot, live.state.contractPath).replaceAll("\\", "/") : ".behavioral-regression/<id>.json";
  const recovery = live.productionFingerprint && live.run?.baselineProductionFingerprint
    && live.productionFingerprint !== live.run.baselineProductionFingerprint
    ? `Update ${path} with hook-issued receipts and repair the implementation to the frozen oracle, or restore the production baseline before replanning.`
    : `Update ${path} with hook-issued receipts, or pause/abort it with a concrete recovery action.`;
  writeJson(stopDeny(`[Behavioral Regression Guard] Behavioral regression workflow cannot stop:\n- ${findings.join("\n- ")}\n${recovery}`));
}

const event = await readStdinJson();
const mode = process.argv[2];
try {
  if (mode === "session") await runSession(event);
  else if (mode === "pre") await runPre(event);
  else if (mode === "post") await runPost(event, false);
  else if (mode === "failure") await runPost(event, true);
  else if (mode === "stop") await runStop(event);
  else if (mode === "review-pre") await runReviewPre(event);
  else if (mode === "review-start") await runReviewStart(event);
  else if (mode === "subagent-stop") await runSubagentStop(event);
  else { warn(`unknown mode: ${mode}`); process.exitCode = 2; }
} catch (error) {
  warn(error?.stack ?? error);
}
