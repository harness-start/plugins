export type ProfileId = "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "ko-KR" | "th-TH";
export type AllowedScript = "han" | "hangul" | "kana" | "thai";

export type LanguageProfile = {
  id: ProfileId;
  label: string;
  allowedScripts: readonly AllowedScript[];
  aliases: RegExp;
  sessionInstruction: string;
  rewriteInstruction: string;
};

export const PROFILE_IDS = Object.freeze([
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "th-TH",
] as const satisfies readonly ProfileId[]);

type ProfileDefinition = Omit<LanguageProfile, "id">;

const PROFILE_DEFINITIONS: Record<ProfileId, ProfileDefinition> = {
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

function freezeProfile(id: ProfileId, profile: ProfileDefinition): LanguageProfile {
  return Object.freeze({
    id,
    ...profile,
    allowedScripts: Object.freeze(profile.allowedScripts),
  });
}

export const PROFILES: Readonly<Record<ProfileId, LanguageProfile>> = Object.freeze({
  "zh-CN": freezeProfile("zh-CN", PROFILE_DEFINITIONS["zh-CN"]),
  "zh-TW": freezeProfile("zh-TW", PROFILE_DEFINITIONS["zh-TW"]),
  "en-US": freezeProfile("en-US", PROFILE_DEFINITIONS["en-US"]),
  "ja-JP": freezeProfile("ja-JP", PROFILE_DEFINITIONS["ja-JP"]),
  "ko-KR": freezeProfile("ko-KR", PROFILE_DEFINITIONS["ko-KR"]),
  "th-TH": freezeProfile("th-TH", PROFILE_DEFINITIONS["th-TH"]),
});

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === "string" && (PROFILE_IDS as readonly string[]).includes(value);
}

export function profileFor(value: unknown): LanguageProfile {
  return PROFILES[isProfileId(value) ? value : "zh-CN"];
}
