import { countHanVariants } from "./han-variants.js";
import { profileFor } from "./profiles.js";

const LETTER_RE = /\p{L}/gu;
const SCRIPT_PATTERNS = {
  han: /\p{Script=Han}/gu,
  hangul: /\p{Script=Hangul}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  thai: /\p{Script=Thai}/gu,
} as const;

const SCRIPT_KEYS = ["han", "hangul", "kana", "thai"] as const satisfies ReadonlyArray<keyof typeof SCRIPT_PATTERNS>;

const MIN_VARIANT_CHARACTERS = 3;
const MIN_JAPANESE_KANA = 2;

export const SCRIPT_LABELS = Object.freeze({
  han: "Han",
  hangul: "Hangul",
  kana: "Kana",
  thai: "Thai",
  "han-traditional": "Traditional Chinese",
  "han-simplified": "Simplified Chinese",
  "han-chinese": "Chinese Han",
});

export type ScriptKey = keyof typeof SCRIPT_PATTERNS;
export type FindingScript = keyof typeof SCRIPT_LABELS;

export type DetectionThresholds = {
  minScriptCharacters: number;
  minLetterRatio: number;
};

export type DriftFinding = {
  script: FindingScript;
  scriptCharacters: number;
  letterRatio: number;
};

export type DriftDetectionOptions = {
  preferredProfile?: string | null | undefined;
  authorizedProfiles?: readonly (string | null | undefined)[] | undefined;
  detection?: DetectionThresholds | undefined;
  stripMarkdown?: boolean | undefined;
};

function matchCount(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function findingForSegment(segment: string, script: ScriptKey, detection: DetectionThresholds): DriftFinding | null {
  const scriptCharacters = matchCount(segment, SCRIPT_PATTERNS[script]);
  if (scriptCharacters < detection.minScriptCharacters) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : scriptCharacters / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters, letterRatio };
}

export function stripNonProseMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/gu, "")
    .replace(/~~~[\s\S]*?(?:~~~|$)/gu, "")
    .replace(/`[^`\n]*`/gu, "")
    .replace(/^\s*>.*$/gmu, "")
    .replace(/\]\([^\n)]*\)/gu, "]")
    .replace(/https?:\/\/\S+/gu, "");
}

export function allowedScripts(
  preferredProfile: string | null | undefined,
  authorizedProfiles: readonly (string | null | undefined)[] = [],
): Set<string> {
  const ids = [preferredProfile, ...authorizedProfiles];
  return new Set(ids.flatMap((id) => profileFor(id).allowedScripts));
}

function allowedHanOrthography(
  preferredProfile: string | null | undefined,
  authorizedProfiles: readonly (string | null | undefined)[] = [],
): { simplified: boolean; traditional: boolean; japanese: boolean } {
  const ids = new Set([preferredProfile, ...authorizedProfiles].filter(Boolean));
  return {
    simplified: ids.has("zh-CN"),
    traditional: ids.has("zh-TW"),
    japanese: ids.has("ja-JP"),
  };
}

function strongestFinding(
  segments: readonly string[],
  detect: (segment: string) => DriftFinding | null,
): DriftFinding | null {
  let strongest: DriftFinding | null = null;
  for (const segment of segments) {
    const finding = detect(segment);
    if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
      strongest = finding;
    }
  }
  return strongest;
}

function variantFinding(
  segment: string,
  script: FindingScript,
  count: number,
  detection: DetectionThresholds,
): DriftFinding | null {
  if (count < MIN_VARIANT_CHARACTERS) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : count / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters: count, letterRatio };
}

function detectHanOrthography(
  candidate: string,
  preferredProfile: string | null | undefined,
  authorizedProfiles: readonly (string | null | undefined)[],
  detection: DetectionThresholds,
): DriftFinding[] {
  const allow = allowedHanOrthography(preferredProfile, authorizedProfiles);
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings: DriftFinding[] = [];

  if (allow.japanese && !allow.simplified && !allow.traditional) {
    const finding = strongestFinding(segments, (segment) => {
      if (matchCount(segment, SCRIPT_PATTERNS.kana) >= MIN_JAPANESE_KANA) return null;
      const base = findingForSegment(segment, "han", detection);
      return base ? { ...base, script: "han-chinese" } : null;
    });
    if (finding) findings.push(finding);
    return findings;
  }

  if (allow.simplified === allow.traditional) return findings;

  const script = allow.simplified ? "han-traditional" : "han-simplified";
  const finding = strongestFinding(segments, (segment) => {
    const counts = countHanVariants(segment);
    const count = allow.simplified
      ? (counts.traditional > counts.simplified ? counts.traditional : 0)
      : (counts.simplified > counts.traditional ? counts.simplified : 0);
    return variantFinding(segment, script, count, detection);
  });
  if (finding) findings.push(finding);
  return findings;
}

export function detectLanguageDrift(
  text: unknown,
  {
    preferredProfile = "zh-CN",
    authorizedProfiles = [],
    detection = { minScriptCharacters: 12, minLetterRatio: 0.25 },
    stripMarkdown = true,
  }: DriftDetectionOptions = {},
): DriftFinding[] {
  if (typeof text !== "string" || !text) return [];
  const allowed = allowedScripts(preferredProfile, authorizedProfiles);
  const candidate = stripMarkdown ? stripNonProseMarkdown(text) : text;
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings: DriftFinding[] = [];

  for (const script of SCRIPT_KEYS) {
    if (allowed.has(script)) continue;
    let strongest: DriftFinding | null = null;
    for (const segment of segments) {
      const finding = findingForSegment(segment, script, detection);
      if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
        strongest = finding;
      }
    }
    if (strongest) findings.push(strongest);
  }
  findings.push(...detectHanOrthography(candidate, preferredProfile, authorizedProfiles, detection));
  return findings;
}
