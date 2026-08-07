export const PROFILE_IDS = Object.freeze([
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "th-TH",
]);

const PROFILE_DEFINITIONS = {
  "zh-CN": {
    label: "简体中文",
    allowedScripts: ["han"],
    aliases: /简体中文|中文|汉语|\bChinese\b/iu,
    sessionInstruction: "自然语言说明使用简体中文。",
    rewriteInstruction: "请完整使用简体中文重写上一回答。",
  },
  "en-US": {
    label: "English",
    allowedScripts: [],
    aliases: /英文|英语|\bEnglish\b/iu,
    sessionInstruction: "Use English for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in English.",
  },
  "ja-JP": {
    label: "日本語",
    allowedScripts: ["han", "kana"],
    aliases: /日文|日语|日本語|\bJapanese\b/iu,
    sessionInstruction: "自然言語の説明には日本語を使用してください。",
    rewriteInstruction: "前の回答全体を日本語で書き直してください。",
  },
  "ko-KR": {
    label: "한국어",
    allowedScripts: ["hangul"],
    aliases: /韩文|韩语|朝鲜语|한국어|\bKorean\b/iu,
    sessionInstruction: "자연어 설명에는 한국어를 사용하세요.",
    rewriteInstruction: "이전 답변 전체를 한국어로 다시 작성하세요.",
  },
  "th-TH": {
    label: "ภาษาไทย",
    allowedScripts: ["thai"],
    aliases: /泰文|泰语|ภาษาไทย|\bThai\b/iu,
    sessionInstruction: "ใช้ภาษาไทยสำหรับคำอธิบายภาษาธรรมชาติ",
    rewriteInstruction: "เขียนคำตอบก่อนหน้าทั้งหมดใหม่เป็นภาษาไทย",
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
