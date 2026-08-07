import { profileFor } from "./profiles.mjs";

const LETTER_RE = /\p{L}/gu;
const SCRIPT_PATTERNS = {
  han: /\p{Script=Han}/gu,
  hangul: /\p{Script=Hangul}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  thai: /\p{Script=Thai}/gu,
};

export const SCRIPT_LABELS = Object.freeze({
  han: "Han",
  hangul: "Hangul",
  kana: "Kana",
  thai: "Thai",
});

function matchCount(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function findingForSegment(segment, script, detection) {
  const scriptCharacters = matchCount(segment, SCRIPT_PATTERNS[script]);
  if (scriptCharacters < detection.minScriptCharacters) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : scriptCharacters / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters, letterRatio };
}

export function stripNonProseMarkdown(text) {
  return text
    .replace(/```[\s\S]*?(?:```|$)/gu, "")
    .replace(/~~~[\s\S]*?(?:~~~|$)/gu, "")
    .replace(/`[^`\n]*`/gu, "")
    .replace(/^\s*>.*$/gmu, "")
    .replace(/\]\([^\n)]*\)/gu, "]")
    .replace(/https?:\/\/\S+/gu, "");
}

export function allowedScripts(preferredProfile, authorizedProfiles = []) {
  const ids = [preferredProfile, ...authorizedProfiles];
  return new Set(ids.flatMap((id) => profileFor(id).allowedScripts));
}

export function detectLanguageDrift(
  text,
  {
    preferredProfile = "zh-CN",
    authorizedProfiles = [],
    detection = { minScriptCharacters: 12, minLetterRatio: 0.25 },
    stripMarkdown = true,
  } = {},
) {
  if (typeof text !== "string" || !text) return [];
  const allowed = allowedScripts(preferredProfile, authorizedProfiles);
  const candidate = stripMarkdown ? stripNonProseMarkdown(text) : text;
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];

  for (const script of Object.keys(SCRIPT_PATTERNS)) {
    if (allowed.has(script)) continue;
    let strongest = null;
    for (const segment of segments) {
      const finding = findingForSegment(segment, script, detection);
      if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
        strongest = finding;
      }
    }
    if (strongest) findings.push(strongest);
  }
  return findings;
}
