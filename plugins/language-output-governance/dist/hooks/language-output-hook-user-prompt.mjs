#!/usr/bin/env node
// harness-source-hash: sha256:5aa7dd7b9b2ec85ef20f453537ce1876a1c089d0805041e6d9d4d9a8d0d1c2d4
import {
  PROFILES,
  PROFILE_IDS,
  extractCwd,
  extractPrompt,
  loadConfig,
  readStdinJson,
  recordLanguageIntent,
  warn
} from "../chunks/chunk-65JJ2KCU.mjs";

// plugins/language-output-governance/src/lib/intent.ts
var TRANSLATION_CUE = /翻译|翻譯|译成|譯成|译为|譯為|翻成|translate|translation/iu;
var RESPONSE_CUE = /后续|後續|以后|以後|接下来|接下來|从现在开始|從現在開始|一直|保持|改用|切换|切換|请用|請用|请使用|請使用|回复|回覆|回答|说明|說明|输出|輸出|沟通|溝通|交流|respond|reply|answer|use|continue/iu;
var GENERIC_CHINESE = /中文|\bChinese\b/iu;
function mentionedProfiles(prompt) {
  const mentioned = new Set(PROFILE_IDS.filter((id) => PROFILES[id].aliases.test(prompt)));
  if (!mentioned.has("zh-CN") && !mentioned.has("zh-TW") && GENERIC_CHINESE.test(prompt)) {
    mentioned.add("zh-CN");
  }
  return PROFILE_IDS.filter((id) => mentioned.has(id));
}
function classifyLanguageIntent(prompt) {
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

// plugins/language-output-governance/src/entries/hooks/language-output-hook-user-prompt.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const intent = classifyLanguageIntent(extractPrompt(event));
  if (!intent.preferredProfile && intent.authorizedProfiles.length === 0) return;
  const { config } = await loadConfig(extractCwd(event), warn);
  recordLanguageIntent(event, config.defaultProfile, intent);
}
main().catch((error) => warn(`UserPromptSubmit failed open: ${error.message}`));
