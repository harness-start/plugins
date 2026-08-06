export const MIN_SCRIPT_CHARACTERS = 12;
export const MIN_LETTER_RATIO = 0.25;

const LETTER_RE = /\p{L}/gu;
const LANGUAGE_PATTERNS = {
  korean: /\p{Script=Hangul}/gu,
  japanese: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  thai: /\p{Script=Thai}/gu,
};

function matchCount(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function driftForSegment(segment, language) {
  const scriptCharacters = matchCount(segment, LANGUAGE_PATTERNS[language]);
  if (scriptCharacters < MIN_SCRIPT_CHARACTERS) return null;

  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : scriptCharacters / letters;
  if (letterRatio < MIN_LETTER_RATIO) return null;

  return { language, scriptCharacters, letterRatio };
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

export function detectLanguageDrift(text, { stripMarkdown = true } = {}) {
  if (typeof text !== "string" || !text) return [];

  const candidate = stripMarkdown ? stripNonProseMarkdown(text) : text;
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];

  for (const language of Object.keys(LANGUAGE_PATTERNS)) {
    let strongest = null;
    for (const segment of segments) {
      const finding = driftForSegment(segment, language);
      if (
        finding &&
        (!strongest || finding.scriptCharacters > strongest.scriptCharacters)
      ) {
        strongest = finding;
      }
    }
    if (strongest) findings.push(strongest);
  }

  return findings;
}
