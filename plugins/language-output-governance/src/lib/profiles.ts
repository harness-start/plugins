export const PROFILE_IDS = Object.freeze([
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "th-TH",
]);

const PROFILE_DEFINITIONS = {
  "zh-CN": {
    label: "Simplified Chinese",
    allowedScripts: ["han"],
    aliases: /简体中文|簡體中文|简体|簡體|简中|汉语|\bSimplified Chinese\b/iu,
    sessionInstruction: "Use Simplified Chinese for natural-language explanations. Do not use Traditional Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Simplified Chinese.",
  },
  "zh-TW": {
    label: "Traditional Chinese",
    allowedScripts: ["han"],
    aliases: /繁體中文|繁体中文|繁體|繁体|正體中文|正体中文|漢語|\bTraditional Chinese\b/iu,
    sessionInstruction: "Use Traditional Chinese for natural-language explanations. Do not use Simplified Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Traditional Chinese.",
  },
  "en-US": {
    label: "English",
    allowedScripts: [],
    aliases: /英文|英语|\bEnglish\b/iu,
    sessionInstruction: "Use English for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in English.",
  },
  "ja-JP": {
    label: "Japanese",
    allowedScripts: ["han", "kana"],
    aliases: /日文|日语|日本語|\bJapanese\b/iu,
    sessionInstruction: "Use Japanese for natural-language explanations. Do not write Chinese-only Han without kana.",
    rewriteInstruction: "Rewrite the complete previous response in Japanese.",
  },
  "ko-KR": {
    label: "Korean",
    allowedScripts: ["hangul"],
    aliases: /韩文|韩语|朝鲜语|한국어|\bKorean\b/iu,
    sessionInstruction: "Use Korean for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Korean.",
  },
  "th-TH": {
    label: "Thai",
    allowedScripts: ["thai"],
    aliases: /泰文|泰语|ภาษาไทย|\bThai\b/iu,
    sessionInstruction: "Use Thai for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Thai.",
  },
};

export const PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(PROFILE_DEFINITIONS).map(([id, profile]) => [
      id,
      Object.freeze({ id, ...profile, allowedScripts: Object.freeze(profile.allowedScripts) }),
    ]),
  ),
);

export function isProfileId(value) {
  return typeof value === "string" && Object.hasOwn(PROFILES, value);
}

export function profileFor(value) {
  return PROFILES[isProfileId(value) ? value : "zh-CN"];
}
