import { SCRIPT_LABELS } from "./language-drift.mjs";
import { profileFor } from "./profiles.mjs";

const TECHNICAL_EXCEPTION = "Code, commands, paths, flags, APIs, types, identifiers, short quotations, and explicitly requested translation content may remain unchanged.";

export function sessionContext(profileId) {
  const profile = profileFor(profileId);
  return [
    `[language-output-governance] profile=${profile.id}`,
    profile.sessionInstruction,
    TECHNICAL_EXCEPTION,
    "An explicit user request for another response language updates the session profile; a translation request authorizes only its target language.",
  ].join("\n");
}

export function toolFeedback(profileId, finding, targets = []) {
  const profile = profileFor(profileId);
  const repair = targets.length > 0
    ? `Review and correct the generated natural-language text in: ${targets.join(", ")}.`
    : "Do not roll back the completed command; correct subsequent generated natural-language text.";
  return [
    "[Language Output Feedback] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} text outside the session language profile ${profile.id}.`,
    repair,
    profile.rewriteInstruction,
  ].join("\n");
}

export function driftBlockReason(profileId, finding) {
  const profile = profileFor(profileId);
  return [
    "[Language Output Gate] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} prose outside the session language profile ${profile.id}.`,
    profile.rewriteInstruction,
    "Preserve every fact, verification receipt, conclusion, and recovery instruction from the previous response.",
    TECHNICAL_EXCEPTION,
  ].join("\n");
}
