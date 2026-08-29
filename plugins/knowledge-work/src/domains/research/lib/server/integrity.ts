import { createHash } from "node:crypto";

export type SealPayload = {
  schema: "research-evidence/v1";
  run_id: string;
  prompt_epoch: unknown;
  mutation_revision: unknown;
  manifest_payload_sha256: string;
  report_sha256: string;
};

export type SealPayloadInput = {
  runId: string;
  promptEpoch: unknown;
  mutationRevision: unknown;
  manifestPayloadHash: string;
  reportHash: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "null";
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sealPayload({ runId, promptEpoch, mutationRevision, manifestPayloadHash, reportHash }: SealPayloadInput): SealPayload {
  return {
    schema: "research-evidence/v1",
    run_id: runId,
    prompt_epoch: promptEpoch,
    mutation_revision: mutationRevision,
    manifest_payload_sha256: manifestPayloadHash,
    report_sha256: reportHash,
  };
}
