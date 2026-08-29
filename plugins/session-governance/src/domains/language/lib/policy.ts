import { SCRIPT_LABELS, type DriftFinding } from "./language-drift.js";
import { profileFor } from "./profiles.js";

const RESPONSE_CONTENT = "All agent-authored natural-language values in responses, including values inside JSON, YAML, TOML, XML, Markdown machine blocks, and tables, must use the response language profile.";
const ARTIFACT_CONTENT = "Generated natural-language values in files must use the artifact language profile.";
const TECHNICAL_EXCEPTION = "Schema names, keys, enum literals, IDs, identifiers, variables, code, commands, paths, flags, APIs, and types remain unchanged. Verbatim quotations and explicitly requested translation content may retain their source or target language. A natural-language value is not exempt merely because it appears inside structured data or a code fence.";

export function sessionContext(profileId: unknown, artifactProfileId?: unknown): string {
  const profile = profileFor(profileId);
  const artifactProfile = artifactProfileId ? profileFor(artifactProfileId) : profile;
  return [
    `[language-output] profile=${profile.id} artifact-profile=${artifactProfile.id}`,
    profile.sessionInstruction,
    RESPONSE_CONTENT,
    `For generated files, an explicit user or project-owned artifact language requirement takes precedence; otherwise use the artifact language profile ${artifactProfile.id}.`,
    TECHNICAL_EXCEPTION,
    "An explicit user request for another response language updates the session profile; a translation request authorizes only its target language.",
  ].join("\n");
}

export function toolFeedback(profileId: unknown, finding: DriftFinding, targets: readonly string[] = []): string {
  const profile = profileFor(profileId);
  const repair = targets.length > 0
    ? `Review and correct the generated natural-language text in: ${targets.join(", ")}.`
    : "Do not roll back the completed command; correct subsequent generated natural-language text.";
  return [
    "[Language Output Feedback] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} text outside the artifact language profile ${profile.id}.`,
    repair,
    `Correct the generated file text in ${profile.label}.`,
    ARTIFACT_CONTENT,
    TECHNICAL_EXCEPTION,
  ].join("\n");
}

export function driftBlockReason(profileId: unknown, finding: DriftFinding): string {
  const profile = profileFor(profileId);
  return [
    "[Language Output Gate] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} prose outside the response language profile ${profile.id}.`,
    profile.rewriteInstruction,
    "Preserve every fact, verification receipt, conclusion, and recovery instruction from the previous response.",
    RESPONSE_CONTENT,
    TECHNICAL_EXCEPTION,
  ].join("\n");
}
