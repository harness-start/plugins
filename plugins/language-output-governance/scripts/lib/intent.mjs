import { PROFILE_IDS, PROFILES } from "./profiles.mjs";

const TRANSLATION_CUE = /翻译|翻譯|译成|譯成|译为|譯為|翻成|translate|translation/iu;
const RESPONSE_CUE = /后续|後續|以后|以後|接下来|接下來|从现在开始|從現在開始|一直|保持|改用|切换|切換|请用|請用|请使用|請使用|回复|回覆|回答|说明|說明|输出|輸出|沟通|溝通|交流|respond|reply|answer|use|continue/iu;
const GENERIC_CHINESE = /中文|\bChinese\b/iu;

function mentionedProfiles(prompt) {
  const mentioned = new Set(PROFILE_IDS.filter((id) => PROFILES[id].aliases.test(prompt)));
  if (!mentioned.has("zh-CN") && !mentioned.has("zh-TW") && GENERIC_CHINESE.test(prompt)) {
    mentioned.add("zh-CN");
  }
  return PROFILE_IDS.filter((id) => mentioned.has(id));
}

export function classifyLanguageIntent(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  const mentioned = mentionedProfiles(prompt);
  if (mentioned.length === 0) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  if (TRANSLATION_CUE.test(prompt)) {
    return { preferredProfile: null, authorizedProfiles: mentioned };
  }
  if (!RESPONSE_CUE.test(prompt)) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  if (mentioned.length !== 1) {
    return { preferredProfile: null, authorizedProfiles: mentioned };
  }
  return { preferredProfile: mentioned[0], authorizedProfiles: [mentioned[0]] };
}
