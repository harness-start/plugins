import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson, sealPayload, sha256 } from "../../server/lib/integrity.mjs";

export function parseTrailer(message) {
  const match = String(message).match(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: ([a-z0-9-]+)\nResearch-Seal: (sha256:[a-f0-9]{64})(?:\n|$)/u);
  return match ? { runId: match[1], seal: match[2] } : null;
}

export async function validateSealedArtifacts({ workspaceRoot, runId, seal, promptEpoch, mutationRevision }) {
  const findings = [];
  if (!/^r-[a-z0-9-]+$/u.test(runId ?? "")) return ["invalid research run id"];
  const directory = join(resolve(workspaceRoot), ".research", "runs", runId);
  let manifest;
  let report;
  try { manifest = JSON.parse(await readFile(join(directory, "research.json"), "utf8")); } catch { return ["research manifest is missing or invalid JSON"]; }
  try { report = await readFile(join(directory, "report.md"), "utf8"); } catch { return ["research report is missing"]; }
  if (manifest.schema !== "research-manifest/v1" || manifest.run_id !== runId) findings.push("research manifest identity mismatch");
  const { integrity, ...base } = manifest;
  if (!integrity || integrity.seal !== seal) findings.push("research seal does not match manifest");
  const manifestPayloadHash = sha256(canonicalJson(base));
  const reportHash = sha256(report);
  if (integrity?.manifest_payload_sha256 !== manifestPayloadHash) findings.push("manifest hash mismatch");
  if (integrity?.report_sha256 !== reportHash) findings.push("report hash mismatch");
  const expectedPayload = sealPayload({ runId, promptEpoch: base.prompt_epoch, mutationRevision: base.mutation_revision, manifestPayloadHash, reportHash });
  const expectedSeal = `sha256:${sha256(canonicalJson(expectedPayload))}`;
  if (expectedSeal !== seal) findings.push("research seal digest mismatch");
  if (promptEpoch !== undefined && base.prompt_epoch !== promptEpoch) findings.push("research seal is from a stale prompt epoch");
  if (mutationRevision !== undefined && base.mutation_revision !== mutationRevision) findings.push("workspace changed after research seal");
  return [...new Set(findings)];
}
