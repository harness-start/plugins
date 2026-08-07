#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectProjectInstructions,
  reconcileProjectInstructions,
  rollbackProjectInstructions,
  verifyProjectInstructions,
} from "./lib/project-instructions.mjs";

function parseArgs(argv) {
  const [action, ...rest] = argv;
  if (!["inspect", "reconcile", "verify", "rollback"].includes(action)) {
    throw new Error("action must be inspect, reconcile, verify, or rollback");
  }
  const values = { action };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid argument near ${flag ?? "<end>"}`);
    }
    const key = flag.slice(2).replace(/-([a-z])/gu, (_, char) => char.toUpperCase());
    if (values[key] !== undefined) throw new Error(`duplicate argument: ${flag}`);
    values[key] = value;
  }
  values.workspace ??= ".";
  return values;
}

function observationDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function receipt(toolId, result, input) {
  const observedAt = new Date().toISOString();
  const invocationId = randomUUID();
  const sessionId = process.env.AI_EXPERTS_SESSION_ID;
  const provenance = {
    triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "manual",
    sessionPresent: Boolean(sessionId),
    ...(sessionId ? { sessionDigest: observationDigest(sessionId) } : {}),
    ...(input.verifiesInvocationId ? { verifiesInvocationId: input.verifiesInvocationId } : {}),
  };
  return {
    schema: "project-instruction-receipt/v1",
    toolId,
    invocationId,
    ok: true,
    observedAt,
    observationDigest: observationDigest({ toolId, invocationId, observedAt, provenance, result }),
    provenance,
    result,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const input = parseArgs(argv);
  let result;
  let toolId;
  if (input.action === "inspect") {
    toolId = "project-instructions-inspect";
    result = inspectProjectInstructions(input.workspace);
  } else if (input.action === "reconcile") {
    toolId = "project-instructions-reconcile";
    result = reconcileProjectInstructions({
      workspace: input.workspace,
      expectedStateDigest: input.expectedStateDigest,
      ...(input.candidateFile ? { candidateFile: input.candidateFile } : {}),
    });
  } else if (input.action === "rollback") {
    toolId = "project-instructions-rollback";
    result = rollbackProjectInstructions({
      workspace: input.workspace,
      expectedStateDigest: input.expectedStateDigest,
      revisionId: input.revisionId,
    });
  } else {
    toolId = "project-instructions-verify";
    result = verifyProjectInstructions({
      workspace: input.workspace,
      decision: input.decision,
      ...(input.expectedRevisionId ? { expectedRevisionId: input.expectedRevisionId } : {}),
    });
    if (!result.ok) {
      throw new Error(`project instructions are not verified; stateDigest=${result.stateDigest}; findings=${result.findings.join(" | ")}`);
    }
  }
  process.stdout.write(`${JSON.stringify(receipt(toolId, result, input))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ schema: "project-instruction-error/v1", ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
