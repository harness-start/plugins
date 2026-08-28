// harness-source-hash: sha256:79ac4709881682e11ae1105400c3a4411820b98c7ab471b44a0566bcc62b10a1
import {
  profileFor
} from "./chunk-XXU46M4R.mjs";

// plugins/session-governance/modules/language/src/lib/han-variants.ts
var HAN_VARIANT_PAIRS = Object.freeze([
  [19994, 26989],
  [19996, 26481],
  [20010, 20491],
  [20026, 28858],
  [20040, 40636],
  [20064, 32722],
  [20080, 36023],
  [20135, 29986],
  [20146, 35242],
  [20165, 20677],
  [20174, 24478],
  [20202, 20736],
  [20204, 20497],
  [20248, 20778],
  [20250, 26371],
  [20255, 20553],
  [20256, 20659],
  [20260, 20663],
  [20262, 20523],
  [20266, 20605],
  [20307, 39636],
  [20390, 20597],
  [20391, 20596],
  [20461, 20745],
  [20457, 20486],
  [20538, 20661],
  [20542, 20670],
  [20826, 40680],
  [20851, 38364],
  [20889, 23531],
  [20891, 36557],
  [20987, 25802],
  [21017, 21063],
  [21150, 36774],
  [21160, 21205],
  [21306, 21312],
  [21327, 21332],
  [21333, 21934],
  [21334, 36067],
  [21381, 24307],
  [21439, 32291],
  [21452, 38617],
  [21464, 35722],
  [21495, 34399],
  [21527, 21966],
  [21548, 32893],
  [21592, 21729],
  [22269, 22283],
  [22788, 34389],
  [22791, 20633],
  [22815, 22816],
  [22836, 38957],
  [23398, 23416],
  [23454, 23526],
  [23545, 23565],
  [23548, 23566],
  [24110, 24171],
  [24191, 24291],
  [24198, 24950],
  [24211, 24235],
  [24212, 25033],
  [24320, 38283],
  [24352, 24373],
  [24403, 30070],
  [24405, 37636],
  [25112, 25136],
  [25143, 25142],
  [25454, 25818],
  [25253, 22577],
  [25968, 25976],
  [26080, 28961],
  [26102, 26178],
  [26426, 27231],
  [26465, 26781],
  [26469, 20358],
  [26500, 27083],
  [26679, 27171],
  [26816, 27298],
  [27721, 28450],
  [27809, 27794],
  [27979, 28204],
  [28857, 40670],
  [29616, 29694],
  [31181, 31278],
  [31616, 31777],
  [32423, 32026],
  [32452, 32068],
  [32463, 32147],
  [32467, 32080],
  [32473, 32102],
  [32493, 32396],
  [32447, 32218],
  [32593, 32178],
  [30721, 30908],
  [32852, 32879],
  [35745, 35336],
  [35748, 35469],
  [35753, 35731],
  [35758, 35696],
  [35760, 35352],
  [35768, 35377],
  [35770, 35542],
  [35774, 35373],
  [35782, 35672],
  [35785, 35380],
  [35805, 35441],
  [35813, 35442],
  [35821, 35486],
  [35823, 35492],
  [35828, 35498],
  [35831, 35531],
  [35835, 35712],
  [36131, 36012],
  [36133, 25943],
  [36135, 36008],
  [36136, 36074],
  [36153, 36027],
  [36164, 36039],
  [36187, 36093],
  [36190, 36106],
  [36710, 36554],
  [36724, 36600],
  [36731, 36629],
  [36733, 36617],
  [36739, 36611],
  [36741, 36628],
  [36744, 36649],
  [36753, 36655],
  [36755, 36664],
  [36798, 36948],
  [36793, 37002],
  [36807, 36942],
  [36824, 36996],
  [36825, 36889],
  [36827, 36914],
  [36830, 36899],
  [36873, 36984],
  [38065, 37666],
  [38169, 37679],
  [38271, 38263],
  [38376, 38272],
  [38381, 38281],
  [38382, 21839],
  [38388, 38291],
  [38431, 38538],
  [39029, 38913],
  [39033, 38917],
  [39034, 38918],
  [39039, 38931],
  [39044, 38928],
  [39046, 38936],
  [39057, 38971],
  [39064, 38988],
  [39068, 38991],
  [39069, 38989],
  [39118, 39080],
  [39134, 39131],
  [39277, 39151],
  [39302, 39208],
  [39532, 39340],
  [39564, 39511],
  [40060, 39770],
  [40479, 40165],
  [40481, 38622],
  [40483, 40180],
  [40857, 40845],
  [19982, 33287],
  [20110, 26044],
  [20869, 20839],
  [30005, 38651],
  [35265, 35211]
]);
var SIMPLIFIED = new Set(HAN_VARIANT_PAIRS.map(([simplified]) => String.fromCodePoint(simplified)));
var TRADITIONAL = new Set(HAN_VARIANT_PAIRS.map(([, traditional]) => String.fromCodePoint(traditional)));
function countHanVariants(text) {
  let simplified = 0;
  let traditional = 0;
  for (const character of String(text ?? "")) {
    if (SIMPLIFIED.has(character)) simplified += 1;
    else if (TRADITIONAL.has(character)) traditional += 1;
  }
  return { simplified, traditional };
}

// plugins/session-governance/modules/language/src/lib/language-drift.ts
var LETTER_RE = new RegExp("\\p{L}", "gu");
var SCRIPT_PATTERNS = {
  han: new RegExp("\\p{Script=Han}", "gu"),
  hangul: new RegExp("\\p{Script=Hangul}", "gu"),
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  thai: new RegExp("\\p{Script=Thai}", "gu")
};
var SCRIPT_KEYS = ["han", "hangul", "kana", "thai"];
var MIN_VARIANT_CHARACTERS = 3;
var MIN_JAPANESE_KANA = 2;
var SCRIPT_LABELS = Object.freeze({
  han: "Han",
  hangul: "Hangul",
  kana: "Kana",
  thai: "Thai",
  "han-traditional": "Traditional Chinese",
  "han-simplified": "Simplified Chinese",
  "han-chinese": "Chinese Han"
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
function stripNonProseMarkdown(text) {
  return text.replace(/```[\s\S]*?(?:```|$)/gu, "").replace(/~~~[\s\S]*?(?:~~~|$)/gu, "").replace(/`[^`\n]*`/gu, "").replace(/^\s*>.*$/gmu, "").replace(/\]\([^\n)]*\)/gu, "]").replace(/https?:\/\/\S+/gu, "");
}
function allowedScripts(preferredProfile, authorizedProfiles = []) {
  const ids = [preferredProfile, ...authorizedProfiles];
  return new Set(ids.flatMap((id) => profileFor(id).allowedScripts));
}
function allowedHanOrthography(preferredProfile, authorizedProfiles = []) {
  const ids = new Set([preferredProfile, ...authorizedProfiles].filter(Boolean));
  return {
    simplified: ids.has("zh-CN"),
    traditional: ids.has("zh-TW"),
    japanese: ids.has("ja-JP")
  };
}
function strongestFinding(segments, detect) {
  let strongest = null;
  for (const segment of segments) {
    const finding = detect(segment);
    if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
      strongest = finding;
    }
  }
  return strongest;
}
function variantFinding(segment, script, count, detection) {
  if (count < MIN_VARIANT_CHARACTERS) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : count / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters: count, letterRatio };
}
function detectHanOrthography(candidate, preferredProfile, authorizedProfiles, detection) {
  const allow = allowedHanOrthography(preferredProfile, authorizedProfiles);
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];
  if (allow.japanese && !allow.simplified && !allow.traditional) {
    const finding2 = strongestFinding(segments, (segment) => {
      if (matchCount(segment, SCRIPT_PATTERNS.kana) >= MIN_JAPANESE_KANA) return null;
      const base = findingForSegment(segment, "han", detection);
      return base ? { ...base, script: "han-chinese" } : null;
    });
    if (finding2) findings.push(finding2);
    return findings;
  }
  if (allow.simplified === allow.traditional) return findings;
  const script = allow.simplified ? "han-traditional" : "han-simplified";
  const finding = strongestFinding(segments, (segment) => {
    const counts = countHanVariants(segment);
    const count = allow.simplified ? counts.traditional > counts.simplified ? counts.traditional : 0 : counts.simplified > counts.traditional ? counts.simplified : 0;
    return variantFinding(segment, script, count, detection);
  });
  if (finding) findings.push(finding);
  return findings;
}
function detectLanguageDrift(text, {
  preferredProfile = "zh-CN",
  authorizedProfiles = [],
  detection = { minScriptCharacters: 12, minLetterRatio: 0.25 },
  stripMarkdown = true
} = {}) {
  if (typeof text !== "string" || !text) return [];
  const allowed = allowedScripts(preferredProfile, authorizedProfiles);
  const candidate = stripMarkdown ? stripNonProseMarkdown(text) : text;
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];
  for (const script of SCRIPT_KEYS) {
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
  findings.push(...detectHanOrthography(candidate, preferredProfile, authorizedProfiles, detection));
  return findings;
}

// plugins/session-governance/modules/language/src/lib/policy.ts
var STRUCTURED_CONTENT = "All agent-authored natural-language values, including values inside JSON, YAML, TOML, XML, Markdown machine blocks, tables, and generated files, must use the session language profile.";
var TECHNICAL_EXCEPTION = "Schema names, keys, enum literals, IDs, identifiers, variables, code, commands, paths, flags, APIs, and types remain unchanged. Verbatim quotations and explicitly requested translation content may retain their source or target language. A natural-language value is not exempt merely because it appears inside structured data or a code fence.";
function sessionContext(profileId) {
  const profile = profileFor(profileId);
  return [
    `[language-output] profile=${profile.id}`,
    profile.sessionInstruction,
    STRUCTURED_CONTENT,
    TECHNICAL_EXCEPTION,
    "An explicit user request for another response language updates the session profile; a translation request authorizes only its target language."
  ].join("\n");
}
function toolFeedback(profileId, finding, targets = []) {
  const profile = profileFor(profileId);
  const repair = targets.length > 0 ? `Review and correct the generated natural-language text in: ${targets.join(", ")}.` : "Do not roll back the completed command; correct subsequent generated natural-language text.";
  return [
    "[Language Output Feedback] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} text outside the session language profile ${profile.id}.`,
    repair,
    profile.rewriteInstruction,
    STRUCTURED_CONTENT,
    TECHNICAL_EXCEPTION
  ].join("\n");
}
function driftBlockReason(profileId, finding) {
  const profile = profileFor(profileId);
  return [
    "[Language Output Gate] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} prose outside the session language profile ${profile.id}.`,
    profile.rewriteInstruction,
    "Preserve every fact, verification receipt, conclusion, and recovery instruction from the previous response.",
    STRUCTURED_CONTENT,
    TECHNICAL_EXCEPTION
  ].join("\n");
}

export {
  detectLanguageDrift,
  sessionContext,
  toolFeedback,
  driftBlockReason
};
