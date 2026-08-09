#!/usr/bin/env node

import { relative } from "node:path";

import {
  commandObservation,
  contextOutput,
  extractCommandCwd,
  extractCwd,
  extractFileTargets,
  extractSessionId,
  extractShellCommand,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { bindContractAfterMutation, completionFindings, discoverContracts, observeCommand, refreshBinding } from "./lib/workflow.mjs";

function warn(message) { process.stderr.write(`[behavioral-regression-guard] ${message}\n`); }

async function runSession(event) {
  const contracts = discoverContracts(extractCwd(event)).filter((item) => item.checked.valid && ["open", "paused"].includes(item.checked.contract.status));
  if (contracts.length === 0) return;
  const lines = ["[Behavioral Regression Guard] Found resumable contracts; discovery does not activate the guard."];
  for (const item of contracts) lines.push(`- ${item.checked.contract.id} (${item.checked.contract.status}, epoch ${item.checked.contract.epoch})`);
  lines.push("Use the behavioral-regression Skill, choose one contract, increment epoch when resuming, and mutate that contract file to activate.");
  writeJson(contextOutput("SessionStart", lines.join("\n")));
}

async function runPost(event, forceFailure = false) {
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);
  const eventName = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets(event);
  if (paths.length > 0) {
    const bound = bindContractAfterMutation({ cwd, sessionId, touchedPaths: paths });
    if (bound.kind === "idle") return;
    if (["bound", "replanned", "resumed"].includes(bound.kind)) {
      writeJson(contextOutput(eventName, `[Behavioral Regression Guard] ${bound.kind === "bound" ? "Bound" : bound.kind === "replanned" ? "Replanned" : "Resumed"} ${bound.contract.id}; plan ${bound.run.planDigest.slice(0, 12)}; ${bound.active ? "capture all BEFORE receipts before changing production" : `status ${bound.contract.status} releases the workflow`}.`));
    } else writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Contract activation rejected: ${(bound.findings ?? []).join("; ")}`));
    return;
  }
  const command = extractShellCommand(event);
  if (!command) return;
  const observed = commandObservation(event, forceFailure);
  const result = observeCommand({ cwd: extractCommandCwd(event), sessionId, command, ...observed });
  if (result.kind === "recorded") {
    const details = result.receipts.map((receipt) => `${receipt.id} ${receipt.caseId} ${receipt.phase.toUpperCase()} (${receipt.outcomeBasis})`).join(", ");
    writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Receipt ${details}. Put only these exact ids into the matching contract receipt fields.`));
  } else if (result.kind === "rejected") {
    writeJson(contextOutput(eventName, `[Behavioral Regression Guard] Evidence rejected: ${result.reason}`));
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
  writeJson(stopDeny(`[Behavioral Regression Guard] Behavioral regression workflow cannot stop:\n- ${findings.join("\n- ")}\nUpdate ${path} with hook-issued receipts, or pause/abort it with a concrete recovery action.`));
}

const event = await readStdinJson();
const mode = process.argv[2];
try {
  if (mode === "session") await runSession(event);
  else if (mode === "post") await runPost(event, false);
  else if (mode === "failure") await runPost(event, true);
  else if (mode === "stop") await runStop(event);
  else { warn(`unknown mode: ${mode}`); process.exitCode = 2; }
} catch (error) {
  warn(error?.stack ?? error);
}
