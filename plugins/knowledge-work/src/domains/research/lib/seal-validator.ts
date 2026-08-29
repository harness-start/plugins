import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import { canonicalJson, sealPayload, sha256 } from "./server/integrity.js";

export type ResearchTrailer = {
  runId: string;
  seal: string;
};

export type ValidateSealInput = {
  workspaceRoot: string;
  runId: string;
  seal: string;
  promptEpoch?: number;
  mutationRevision?: number;
};

export function parseTrailer(message: string): ResearchTrailer | null {
  const match = String(message).match(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: ([a-z0-9-]+)\nResearch-Seal: (sha256:[a-f0-9]{64})(?:\n|$)/u);
  const runId = match?.[1];
  const seal = match?.[2];
  return runId && seal ? { runId, seal } : null;
}

export async function validateSealedArtifacts({ workspaceRoot, runId, seal, promptEpoch, mutationRevision }: ValidateSealInput): Promise<string[]> {
  const findings: string[] = [];
  if (typeof runId !== "string" || !/^r-[a-z0-9-]+$/u.test(runId)) return ["invalid research run id"];
  const directory = join(resolve(workspaceRoot), ".research", "runs", runId);
  let manifest: Record<string, unknown>;
  let report: string;
  try {
    const parsed: unknown = JSON.parse(await readFile(join(directory, "research.json"), "utf8"));
    if (!isRecord(parsed)) return ["research manifest is missing or invalid JSON"];
    manifest = parsed;
  } catch { return ["research manifest is missing or invalid JSON"]; }
  try { report = await readFile(join(directory, "report.md"), "utf8"); } catch { return ["research report is missing"]; }
  if (manifest.schema !== "research-manifest/v1" || manifest.run_id !== runId) findings.push("research manifest identity mismatch");
  const { integrity, ...base } = manifest;
  const integrityRecord = isRecord(integrity) ? integrity : null;
  if (!integrityRecord || integrityRecord.seal !== seal) findings.push("research seal does not match manifest");
  const manifestPayloadHash = sha256(canonicalJson(base));
  const reportHash = sha256(report);
  if (integrityRecord?.manifest_payload_sha256 !== manifestPayloadHash) findings.push("manifest hash mismatch");
  if (integrityRecord?.report_sha256 !== reportHash) findings.push("report hash mismatch");
  const expectedPayload = sealPayload({ runId, promptEpoch: base.prompt_epoch, mutationRevision: base.mutation_revision, manifestPayloadHash, reportHash });
  const expectedSeal = `sha256:${sha256(canonicalJson(expectedPayload))}`;
  if (expectedSeal !== seal) findings.push("research seal digest mismatch");
  if (promptEpoch !== undefined && base.prompt_epoch !== promptEpoch) findings.push("research seal is from a stale prompt epoch");
  if (mutationRevision !== undefined && base.mutation_revision !== mutationRevision) findings.push("workspace changed after research seal");
  return [...new Set(findings)];
}
