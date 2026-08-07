import { PROFILE_IDS, PROFILES } from "./profiles.mjs";

const TRANSLATION_CUE = /翻译|译成|译为|翻成|translate|translation/iu;
const RESPONSE_CUE = /后续|以后|接下来|从现在开始|一直|保持|改用|切换|请用|请使用|回复|回答|说明|输出|沟通|交流|respond|reply|answer|use|continue/iu;

function mentionedProfiles(prompt) {
  return PROFILE_IDS.filter((id) => PROFILES[id].aliases.test(prompt));
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
