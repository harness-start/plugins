const FENCE_RE = /```verification-evidence[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;
const CLAIM_LINE_RE = /^- \[(C[1-9]\d*)\]\[(locally-verified|artifact-verified|remote-ci|inferred|unverified)\] ([^\r\n]+)$/gmu;
const CLAIM_IDS = /^C[1-9]\d*$/u;
const EVIDENCE_IDS = /^E[1-9]\d*$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMPLETIONS = new Set(["done", "done_with_concerns", "blocked", "needs_context"]);
const STATUSES = new Set(["verified", "inferred", "unverified"]);
const PREDICATES = new Set([
  "test_suite_passed",
  "verification_succeeded",
  "artifact_materialized",
  "git_state_matches",
  "ci_pipeline_succeeded",
  "other",
]);
const FORMATS = new Set(["text", "json", "pdf", "png", "jpeg", "zip", "binary"]);
const PROVIDERS = new Set(["gitlab", "github"]);
const WORKFLOW_PROFILES = new Set(["code_behavior", "code_refactor", "non_code"]);
const CHALLENGE_KINDS = new Set(["red_test", "baseline_green", "negative_check", "counterexample", "dry_run", "not_applicable"]);

function byteLength(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

function stringField(value, label, { max = 2048, pattern } = {}) {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > max) {
    throw new Error(`${label} must be a non-empty string <= ${max} bytes`);
  }
  if (/[\r\n]/u.test(value)) throw new Error(`${label} must be one line`);
  if (pattern && !pattern.test(value)) throw new Error(`${label} has an invalid format`);
  return value;
}

function integerField(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

class DuplicateAwareJsonScanner {
  constructor(source, maxDepth) {
    this.source = source;
    this.maxDepth = maxDepth;
    this.index = 0;
  }

  scan() {
    this.#space();
    this.#value(0);
    this.#space();
    if (this.index !== this.source.length) throw new Error("manifest contains trailing JSON content");
  }

  #space() {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  #value(depth) {
    if (depth > this.maxDepth) throw new Error(`manifest exceeds maximum depth ${this.maxDepth}`);
    this.#space();
    const char = this.source[this.index];
    if (char === "{") return this.#object(depth + 1);
    if (char === "[") return this.#array(depth + 1);
    if (char === '"') return this.#string();
    const tail = this.source.slice(this.index);
    const primitive = tail.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
    if (!primitive) throw new Error(`invalid JSON token at offset ${this.index}`);
    this.index += primitive.length;
  }

  #string() {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      this.index += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        const token = this.source.slice(start, this.index);
        try { return JSON.parse(token); } catch { throw new Error(`invalid JSON string at offset ${start}`); }
      }
      if (char.charCodeAt(0) < 0x20) throw new Error(`control character in JSON string at offset ${start}`);
    }
    throw new Error(`unterminated JSON string at offset ${start}`);
  }

  #object(depth) {
    this.index += 1;
    this.#space();
    const keys = new Set();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') throw new Error(`object key must be a string at offset ${this.index}`);
      const key = this.#string();
      if (keys.has(key)) throw new Error(`duplicate key: ${key}`);
      keys.add(key);
      this.#space();
      if (this.source[this.index] !== ":") throw new Error(`missing colon after key ${key}`);
      this.index += 1;
      this.#value(depth);
      this.#space();
      const separator = this.source[this.index];
      this.index += 1;
      if (separator === "}") return;
      if (separator !== ",") throw new Error(`invalid object separator at offset ${this.index - 1}`);
      this.#space();
    }
    throw new Error("unterminated JSON object");
  }

  #array(depth) {
    this.index += 1;
    this.#space();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }
    while (this.index < this.source.length) {
      this.#value(depth);
      this.#space();
      const separator = this.source[this.index];
      this.index += 1;
      if (separator === "]") return;
      if (separator !== ",") throw new Error(`invalid array separator at offset ${this.index - 1}`);
      this.#space();
    }
    throw new Error("unterminated JSON array");
  }
}

export function extractEvidenceBlock(text, { maxBytes = 32 * 1024 } = {}) {
  const matches = [...String(text ?? "").matchAll(FENCE_RE)];
  if (matches.length === 0) return { present: false, raw: null, outside: String(text ?? "") };
  if (matches.length !== 1) throw new Error("response must contain exactly one verification-evidence block");
  const raw = matches[0][1];
  if (byteLength(raw) > maxBytes) throw new Error(`verification-evidence block exceeds maximum ${maxBytes} bytes`);
  const start = matches[0].index;
  const end = start + matches[0][0].length;
  return { present: true, raw, outside: `${String(text).slice(0, start)}${String(text).slice(end)}` };
}

function validateSummary(summary, label) {
  assertObject(summary, label);
  exactKeys(summary, new Set(["passed", "failed", "skipped"]), label);
  const result = {};
  for (const key of Object.keys(summary)) result[key] = integerField(summary[key], `${label}.${key}`);
  if (Object.keys(result).length === 0) throw new Error(`${label} must contain at least one count`);
  return result;
}

function validateEvidence(entry, index, schema) {
  const label = `evidence[${index}]`;
  assertObject(entry, label);
  const id = stringField(entry.id, `${label}.id`, { pattern: EVIDENCE_IDS });
  const kind = stringField(entry.kind, `${label}.kind`, { max: 32 });
  if (kind === "command") {
    const command = stringField(entry.command, `${label}.command`, { max: 4096 });
    if (schema === "verification-evidence/v1") {
      exactKeys(entry, new Set(["id", "kind", "command", "exitCode", "summary"]), label);
      if (entry.exitCode !== 0) throw new Error(`${label}.exitCode must equal 0`);
      return { id, kind, command, exitCode: 0, ...(entry.summary === undefined ? {} : { summary: validateSummary(entry.summary, `${label}.summary`) }) };
    }
    exactKeys(entry, new Set(["id", "kind", "command", "outcome", "summary"]), label);
    if (!["success", "expected_failure"].includes(entry.outcome)) throw new Error(`${label}.outcome is unsupported`);
    const summary = entry.summary === undefined ? undefined : validateSummary(entry.summary, `${label}.summary`);
    if (entry.outcome === "expected_failure" && !(summary?.failed > 0)) {
      throw new Error(`${label}: expected_failure requires summary.failed > 0`);
    }
    return { id, kind, command, outcome: entry.outcome, ...(summary === undefined ? {} : { summary }) };
  }
  if (kind === "artifact") {
    exactKeys(entry, new Set(["id", "kind", "path", "format", "bytes", "sha256"]), label);
    if (!FORMATS.has(entry.format)) throw new Error(`${label}.format is unsupported`);
    stringField(entry.path, `${label}.path`, { max: 4096 });
    stringField(entry.sha256, `${label}.sha256`, { pattern: SHA256 });
    return { id, kind, path: entry.path, format: entry.format, bytes: integerField(entry.bytes, `${label}.bytes`), sha256: entry.sha256 };
  }
  if (kind === "git") {
    exactKeys(entry, new Set(["id", "kind", "head", "branch", "clean"]), label);
    stringField(entry.head, `${label}.head`, { pattern: SHA1 });
    stringField(entry.branch, `${label}.branch`, { max: 255 });
    if (typeof entry.clean !== "boolean") throw new Error(`${label}.clean must be boolean`);
    return { id, kind, head: entry.head, branch: entry.branch, clean: entry.clean };
  }
  if (kind === "ci") {
    exactKeys(entry, new Set(["id", "kind", "provider", "pipelineId", "status", "sha", "url", "query"]), label);
    if (!PROVIDERS.has(entry.provider)) throw new Error(`${label}.provider is unsupported`);
    if (entry.status !== "success") throw new Error(`${label}.status must equal success`);
    stringField(entry.pipelineId, `${label}.pipelineId`, { max: 128 });
    stringField(entry.sha, `${label}.sha`, { pattern: SHA1 });
    stringField(entry.query, `${label}.query`, { max: 4096 });
    const url = stringField(entry.url, `${label}.url`, { max: 2048 });
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`${label}.url must be an HTTP(S) URL`); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`${label}.url must be an HTTP(S) URL without credentials`);
    }
    return { ...entry, id, kind };
  }
  throw new Error(`${label}.kind is unsupported: ${kind}`);
}

function evidenceIds(value, label, { min = 0, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${label} must contain ${min}..${max} ids`);
  }
  const ids = value.map((item, index) => stringField(item, `${label}[${index}]`, { pattern: EVIDENCE_IDS }));
  assertUnique(ids, `${label} reference`);
  return ids;
}

function validateWorkflowReview(entry) {
  const label = "workflow.adversarialReview";
  assertObject(entry, label);
  exactKeys(entry, new Set(["status", "statement", "evidence", "basis", "reason"]), label);
  const status = stringField(entry.status, `${label}.status`, { max: 32 });
  const statement = stringField(entry.statement, `${label}.statement`, { max: 1000 });
  if (!STATUSES.has(status)) throw new Error(`${label}.status is unsupported`);
  if (status === "verified") {
    if (entry.basis !== undefined || entry.reason !== undefined) throw new Error(`${label}: verified review must not contain basis or reason`);
    return { status, statement, evidence: evidenceIds(entry.evidence, `${label}.evidence`, { min: 1 }) };
  }
  if (status === "inferred") {
    if (entry.reason !== undefined) throw new Error(`${label}: inferred review must not contain reason`);
    return {
      status,
      statement,
      basis: stringField(entry.basis, `${label}.basis`, { max: 2000 }),
      evidence: entry.evidence === undefined ? [] : evidenceIds(entry.evidence, `${label}.evidence`),
    };
  }
  if (entry.basis !== undefined || entry.evidence !== undefined) throw new Error(`${label}: unverified review must not contain basis or evidence`);
  return { status, statement, reason: stringField(entry.reason, `${label}.reason`, { max: 2000 }), evidence: [] };
}

function validateWorkflow(entry) {
  const label = "workflow";
  assertObject(entry, label);
  exactKeys(entry, new Set(["profile", "contract", "challenge", "targetedVerification", "completeVerification", "adversarialReview"]), label);
  const profile = stringField(entry.profile, `${label}.profile`, { max: 32 });
  if (!WORKFLOW_PROFILES.has(profile)) throw new Error(`${label}.profile is unsupported`);
  const contract = stringField(entry.contract, `${label}.contract`, { max: 1000 });
  assertObject(entry.challenge, `${label}.challenge`);
  exactKeys(entry.challenge, new Set(["kind", "evidence", "basis"]), `${label}.challenge`);
  const kind = stringField(entry.challenge.kind, `${label}.challenge.kind`, { max: 32 });
  if (!CHALLENGE_KINDS.has(kind)) throw new Error(`${label}.challenge.kind is unsupported`);
  const reasoned = ["counterexample", "not_applicable"].includes(kind);
  if (reasoned && entry.challenge.basis === undefined) throw new Error(`${label}.challenge.basis is required for ${kind}`);
  if (!reasoned && entry.challenge.basis !== undefined) throw new Error(`${label}.challenge.basis is not allowed for ${kind}`);
  const challengeEvidence = entry.challenge.evidence === undefined
    ? []
    : evidenceIds(entry.challenge.evidence, `${label}.challenge.evidence`);
  if (!reasoned && challengeEvidence.length === 0) throw new Error(`${label}.challenge.evidence must contain 1..20 ids`);
  return {
    profile,
    contract,
    challenge: {
      kind,
      evidence: challengeEvidence,
      ...(reasoned ? { basis: stringField(entry.challenge.basis, `${label}.challenge.basis`, { max: 2000 }) } : {}),
    },
    targetedVerification: evidenceIds(entry.targetedVerification, `${label}.targetedVerification`),
    completeVerification: evidenceIds(entry.completeVerification, `${label}.completeVerification`),
    adversarialReview: validateWorkflowReview(entry.adversarialReview),
  };
}

function validateClaim(entry, index) {
  const label = `claims[${index}]`;
  assertObject(entry, label);
  exactKeys(entry, new Set(["id", "predicate", "status", "statement", "evidence", "basis", "reason"]), label);
  const id = stringField(entry.id, `${label}.id`, { pattern: CLAIM_IDS });
  const predicate = stringField(entry.predicate, `${label}.predicate`, { max: 64 });
  const status = stringField(entry.status, `${label}.status`, { max: 32 });
  const statement = stringField(entry.statement, `${label}.statement`, { max: 1000 });
  if (!PREDICATES.has(predicate)) throw new Error(`${label}.predicate is unsupported`);
  if (!STATUSES.has(status)) throw new Error(`${label}.status is unsupported`);
  if (status === "verified") {
    if (entry.basis !== undefined || entry.reason !== undefined) throw new Error(`${label}: verified claims must not contain basis or reason`);
    if (predicate === "other") throw new Error(`${label}: predicate other cannot be verified`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.length > 20) {
      throw new Error(`${label}.evidence must contain 1..20 ids`);
    }
    const evidence = entry.evidence.map((value, evidenceIndex) =>
      stringField(value, `${label}.evidence[${evidenceIndex}]`, { pattern: EVIDENCE_IDS }));
    assertUnique(evidence, `${label} evidence reference`);
    return { id, predicate, status, statement, evidence };
  }
  if (status === "inferred") {
    if (entry.reason !== undefined) throw new Error(`${label}: inferred claims must not contain reason`);
    const evidence = entry.evidence === undefined ? [] : (() => {
      if (!Array.isArray(entry.evidence) || entry.evidence.length > 20) throw new Error(`${label}.evidence must contain 0..20 ids`);
      const ids = entry.evidence.map((value, evidenceIndex) => stringField(value, `${label}.evidence[${evidenceIndex}]`, { pattern: EVIDENCE_IDS }));
      assertUnique(ids, `${label} evidence reference`);
      return ids;
    })();
    return { id, predicate, status, statement, basis: stringField(entry.basis, `${label}.basis`, { max: 2000 }), evidence };
  }
  if (entry.basis !== undefined || entry.evidence !== undefined) throw new Error(`${label}: unverified claims must not contain basis or evidence`);
  return { id, predicate, status, statement, reason: stringField(entry.reason, `${label}.reason`, { max: 2000 }) };
}

function expectedEvidenceKind(predicate) {
  if (["test_suite_passed", "verification_succeeded"].includes(predicate)) return "command";
  if (predicate === "artifact_materialized") return "artifact";
  if (predicate === "git_state_matches") return "git";
  if (predicate === "ci_pipeline_succeeded") return "ci";
  return null;
}

export function parseEvidenceManifest(raw, { maxDepth = 8, maxItems = 20 } = {}) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("manifest must be non-empty JSON");
  new DuplicateAwareJsonScanner(raw, maxDepth).scan();
  let value;
  try { value = JSON.parse(raw); } catch (error) { throw new Error(`manifest is invalid JSON: ${error.message}`); }
  assertObject(value, "manifest");
  if (!["verification-evidence/v1", "verification-evidence/v2"].includes(value.schema)) {
    throw new Error("manifest.schema must equal verification-evidence/v1 or verification-evidence/v2");
  }
  const isV2 = value.schema === "verification-evidence/v2";
  exactKeys(value, new Set(["schema", "completion", "claims", "evidence", ...(isV2 ? ["workflow"] : [])]), "manifest");
  if (!COMPLETIONS.has(value.completion)) throw new Error("manifest.completion is unsupported");
  if (!Array.isArray(value.claims) || value.claims.length < 1 || value.claims.length > maxItems) {
    throw new Error(`manifest.claims must contain 1..${maxItems} entries`);
  }
  if (!Array.isArray(value.evidence) || value.evidence.length > maxItems) {
    throw new Error(`manifest.evidence must contain 0..${maxItems} entries`);
  }
  const claims = value.claims.map(validateClaim);
  const evidence = value.evidence.map((entry, index) => validateEvidence(entry, index, value.schema));
  const workflow = isV2 ? validateWorkflow(value.workflow) : null;
  assertUnique(claims.map((entry) => entry.id), "claim id");
  assertUnique(evidence.map((entry) => entry.id), "evidence id");
  const byId = new Map(evidence.map((entry) => [entry.id, entry]));
  const referenced = new Set();
  for (const claim of claims) {
    for (const id of claim.evidence ?? []) {
      if (!byId.has(id)) throw new Error(`${claim.id} references unknown evidence: ${id}`);
      referenced.add(id);
    }
    if (claim.status !== "verified") continue;
    const expected = expectedEvidenceKind(claim.predicate);
    for (const id of claim.evidence) {
      const item = byId.get(id);
      if (item.kind !== expected) throw new Error(`${claim.id} requires ${expected} evidence, received ${item.kind}`);
      if (item.kind === "command" && item.outcome === "expected_failure") {
        throw new Error(`${claim.id}: expected_failure evidence cannot support a completion claim`);
      }
    }
    if (claim.predicate === "test_suite_passed" && /(?:\b\d+\s*\/\s*\d+\b|\b\d+\s+(?:tests?|passed)\b|\d+\s*(?:个)?(?:测试)?通过)/iu.test(claim.statement)) {
      if (!claim.evidence.some((id) => byId.get(id)?.summary)) throw new Error(`${claim.id}: numeric test claims require a structured summary`);
    }
  }
  if (workflow) {
    const workflowIds = [
      ...workflow.challenge.evidence,
      ...workflow.targetedVerification,
      ...workflow.completeVerification,
      ...workflow.adversarialReview.evidence,
    ];
    for (const id of workflowIds) {
      if (!byId.has(id)) throw new Error(`workflow references unknown evidence: ${id}`);
      referenced.add(id);
    }
  }
  for (const item of evidence) if (!referenced.has(item.id)) throw new Error(`unreferenced evidence: ${item.id}`);
  if (value.completion === "done" && claims.some((claim) => claim.status !== "verified")) {
    throw new Error("completion must be done_with_concerns, blocked, or needs_context when claims are inferred or unverified");
  }
  return { schema: value.schema, completion: value.completion, ...(workflow ? { workflow } : {}), claims, evidence };
}

function expectedVisibleTag(claim) {
  if (claim.status === "inferred") return "inferred";
  if (claim.status === "unverified") return "unverified";
  if (claim.predicate === "artifact_materialized") return "artifact-verified";
  if (claim.predicate === "ci_pipeline_succeeded") return "remote-ci";
  return "locally-verified";
}

export function validateVisibleClaims(text, manifest, options = {}) {
  const { outside } = extractEvidenceBlock(text, options);
  const visible = [...outside.matchAll(CLAIM_LINE_RE)].map((match) => ({ id: match[1], tag: match[2], statement: match[3] }));
  const counts = new Map();
  for (const item of visible) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  for (const claim of manifest.claims) {
    const count = counts.get(claim.id) ?? 0;
    if (count === 0) throw new Error(`missing visible claim: ${claim.id}`);
    if (count !== 1) throw new Error(`visible claim ${claim.id} must appear exactly once`);
    const item = visible.find((candidate) => candidate.id === claim.id);
    if (item.statement !== claim.statement) throw new Error(`visible claim ${claim.id} does not match manifest statement`);
    const tag = expectedVisibleTag(claim);
    if (item.tag !== tag) throw new Error(`visible claim ${claim.id} requires tag [${tag}]`);
  }
  for (const item of visible) {
    if (!manifest.claims.some((claim) => claim.id === item.id)) throw new Error(`visible claim references unknown manifest claim: ${item.id}`);
  }
  return visible;
}

export function removeEvidenceAndClaimLines(text, options = {}) {
  const { outside } = extractEvidenceBlock(text, options);
  return outside.replace(CLAIM_LINE_RE, "");
}
