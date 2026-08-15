// harness-source-hash: sha256:d945f3b122937f9aa290663ad4b77a5862f9dd48007b111f6f6c2dd40fb0bf38

// plugins/research-provenance-guard/src/lib/server/integrity.ts
import { createHash } from "node:crypto";
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "null";
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sealPayload({ runId, promptEpoch, mutationRevision, manifestPayloadHash, reportHash }) {
  return {
    schema: "research-evidence/v1",
    run_id: runId,
    prompt_epoch: promptEpoch,
    mutation_revision: mutationRevision,
    manifest_payload_sha256: manifestPayloadHash,
    report_sha256: reportHash
  };
}

export {
  canonicalJson,
  sha256,
  sealPayload
};
