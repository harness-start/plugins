import { SCRIPT_LABELS, type DriftFinding } from "./language-drift.js";
import { profileFor } from "./profiles.js";

const STRUCTURED_CONTENT = "All agent-authored natural-language values, including values inside JSON, YAML, TOML, XML, Markdown machine blocks, tables, and generated files, must use the session language profile.";
const TECHNICAL_EXCEPTION = "Schema names, keys, enum literals, IDs, identifiers, variables, code, commands, paths, flags, APIs, and types remain unchanged. Verbatim quotations and explicitly requested translation content may retain their source or target language. A natural-language value is not exempt merely because it appears inside structured data or a code fence.";

export function sessionContext(profileId: unknown): string {
  const profile = profileFor(profileId);
  return [
    `[language-output] profile=${profile.id}`,
    profile.sessionInstruction,
    STRUCTURED_CONTENT,
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
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} text outside the session language profile ${profile.id}.`,
    repair,
    profile.rewriteInstruction,
    STRUCTURED_CONTENT,
    TECHNICAL_EXCEPTION,
  ].join("\n");
}

export function driftBlockReason(profileId: unknown, finding: DriftFinding): string {
  const profile = profileFor(profileId);
  return [
    "[Language Output Gate] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} prose outside the session language profile ${profile.id}.`,
    profile.rewriteInstruction,
    "Preserve every fact, verification receipt, conclusion, and recovery instruction from the previous response.",
    STRUCTURED_CONTENT,
    TECHNICAL_EXCEPTION,
  ].join("\n");
}
