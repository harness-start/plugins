#!/usr/bin/env node

import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractSessionId,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  discoverWorkflows,
  processArtifactMutation,
  stopDecision,
} from "./lib/workflow.mjs";

function feedback(result) {
  if (!result || result.kind === "idle") return null;
  if (result.kind === "bound") {
    return `[Reasoning Discipline Guard] Bound ${result.manifest.id}; write 01-frame.md next.`;
  }
  if (result.kind === "signed") {
    return `[Reasoning Discipline Guard] Accepted ${result.receipt.stage} as ${result.receipt.id}; next: ${result.nextStage}.`;
  }
  if (result.kind === "closed") {
    return "[Reasoning Discipline Guard] Workflow closed with RD-R5.";
  }
  if (result.kind === "refreshed") {
    return `[Reasoning Discipline Guard] Workflow status refreshed to ${result.manifest.status}.`;
  }
  const findings = result.findings ?? ["artifact mutation could not be validated"];
  return `[Reasoning Discipline Guard] ${result.kind}: ${findings.join("; ")}`;
}

async function main() {
  const mode = process.argv[2] ?? "";
  const event = await readStdinJson();
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);

  if (mode === "session") {
    const workflows = discoverWorkflows(cwd);
    if (workflows.length > 0) {
      writeJson(contextOutput(
        "SessionStart",
        `[Reasoning Discipline Guard] Discovered ${workflows.length} workflow(s); none was activated. Use $reasoning-discipline to select and resume one.`,
      ));
    }
    return;
  }

  if (mode === "failure") {
    const paths = extractFileTargets(event);
    if (paths.some((path) => path.includes(".reasoning-discipline"))) {
      writeJson(contextOutput(
        "PostToolUseFailure",
        "[Reasoning Discipline Guard] Artifact write failed; workflow activation and receipts were not advanced.",
      ));
    }
    return;
  }

  if (mode === "post") {
    const result = processArtifactMutation({
      cwd,
      sessionId,
      paths: extractFileTargets(event),
    });
    const message = feedback(result);
    if (message) writeJson(contextOutput("PostToolUse", message));
    return;
  }

  if (mode === "stop") {
    const decision = stopDecision({
      cwd,
      sessionId,
      assistantMessage: extractAssistantMessage(event),
    });
    if (decision.kind === "block") {
      writeJson(stopDeny([
        "[Reasoning Discipline Guard] The active reasoning workflow cannot end yet.",
        ...decision.findings.map((finding) => `- ${finding}`),
        "Complete the ordered artifacts, or set workflow.status to paused/aborted with an honest recovery record.",
      ].join("\n")));
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[reasoning-discipline-guard] ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
