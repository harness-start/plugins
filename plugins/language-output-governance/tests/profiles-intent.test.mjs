import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyLanguageIntent } from "../scripts/lib/intent.mjs";
import {
  detectLanguageDrift,
  stripNonProseMarkdown,
} from "../scripts/lib/language-drift.mjs";
import { PROFILE_IDS } from "../scripts/lib/profiles.mjs";

const SAMPLES = {
  han: "这是十二个以上的中文汉字内容用于检测",
  hangul: "가나다라마바사아자차카타",
  kana: "あいうえおかきくけこさし",
  thai: "กขคฆงจฉชซฌญฎ",
};

const EXPECTED_DRIFT = {
  "zh-CN": ["hangul", "kana", "thai"],
  "zh-TW": ["hangul", "kana", "thai"],
  "en-US": ["han", "hangul", "kana", "thai"],
  "ja-JP": ["hangul", "thai"],
  "ko-KR": ["han", "kana", "thai"],
  "th-TH": ["han", "hangul", "kana"],
};

test("built-in profiles expose the six supported language IDs", () => {
  assert.deepEqual(PROFILE_IDS, ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "th-TH"]);
});

for (const profile of PROFILE_IDS) {
  test(`${profile} reports only scripts outside its built-in profile`, () => {
    const findings = Object.entries(SAMPLES)
      .filter(([, text]) => detectLanguageDrift(text, { preferredProfile: profile }).length > 0)
      .map(([script]) => script);
    assert.deepEqual(findings, EXPECTED_DRIFT[profile]);
  });
}

test("an authorized translation profile removes its scripts from drift", () => {
  const findings = detectLanguageDrift(SAMPLES.kana, {
    preferredProfile: "zh-CN",
    authorizedProfiles: ["ja-JP"],
  });
  assert.deepEqual(findings, []);
});

test("Latin technical prose remains allowed for every profile", () => {
  for (const preferredProfile of PROFILE_IDS) {
    assert.deepEqual(
      detectLanguageDrift("Use Node.js API and run node --test for technical validation.", { preferredProfile }),
      [],
    );
  }
});

test("thresholds cover both individual lines and the complete response", () => {
  assert.deepEqual(
    detectLanguageDrift("가나다라마바사아자차카", { preferredProfile: "zh-CN" }),
    [],
  );
  assert.equal(
    detectLanguageDrift("가나다라\n마바사아\n자차카타", { preferredProfile: "zh-CN" })[0].script,
    "hangul",
  );
  assert.deepEqual(
    detectLanguageDrift(`${"technical".repeat(8)} ${SAMPLES.hangul}`, { preferredProfile: "zh-CN" }),
    [],
  );
});

test("Markdown code, quotes, URLs, and link targets are excluded", () => {
  const markdown = [
    "```text",
    SAMPLES.kana,
    "```",
    `\`${SAMPLES.hangul}\``,
    `> ${SAMPLES.thai}`,
    `[文档](https://example.com/${SAMPLES.kana})`,
  ].join("\n");
  assert.deepEqual(detectLanguageDrift(markdown, { preferredProfile: "zh-CN" }), []);
  assert.equal(stripNonProseMarkdown(markdown).includes("あいうえお"), false);
});

for (const [prompt, profile] of [
  ["后续请使用简体中文回答。", "zh-CN"],
  ["後續請使用繁體中文回答。", "zh-TW"],
  ["Please continue to answer in English.", "en-US"],
  ["后续请使用日文回答。", "ja-JP"],
  ["后续请使用韩文回答。", "ko-KR"],
  ["后续请使用泰文回答。", "th-TH"],
]) {
  test(`explicit session language intent selects ${profile}`, () => {
    assert.deepEqual(classifyLanguageIntent(prompt), {
      preferredProfile: profile,
      authorizedProfiles: [profile],
    });
  });
}

test("translation intent authorizes content without changing the preferred profile", () => {
  assert.deepEqual(classifyLanguageIntent("把这段内容翻译成日文。"), {
    preferredProfile: null,
    authorizedProfiles: ["ja-JP"],
  });
});

test("language mentions without response intent do not change session state", () => {
  assert.deepEqual(classifyLanguageIntent("比较日文与韩文的 Unicode Script。"), {
    preferredProfile: null,
    authorizedProfiles: [],
  });
});

test("ambiguous multi-language response intent authorizes without guessing a preferred profile", () => {
  assert.deepEqual(classifyLanguageIntent("请用日文和韩文回答。"), {
    preferredProfile: null,
    authorizedProfiles: ["ja-JP", "ko-KR"],
  });
});

test("generic Chinese keeps selecting the Simplified Chinese profile", () => {
  assert.deepEqual(classifyLanguageIntent("后续请使用中文回答。"), {
    preferredProfile: "zh-CN",
    authorizedProfiles: ["zh-CN"],
  });
});

test("Simplified and Traditional Chinese intent remains explicitly ambiguous", () => {
  assert.deepEqual(classifyLanguageIntent("请同时使用简体中文和繁體中文回答。"), {
    preferredProfile: null,
    authorizedProfiles: ["zh-CN", "zh-TW"],
  });
});

test("Traditional Chinese response cues select the Traditional Chinese profile", () => {
  assert.deepEqual(classifyLanguageIntent("請用繁體中文回覆。"), {
    preferredProfile: "zh-TW",
    authorizedProfiles: ["zh-TW"],
  });
});

test("Traditional Chinese translation cues authorize without changing the profile", () => {
  assert.deepEqual(classifyLanguageIntent("請把這段內容翻譯成繁體中文。"), {
    preferredProfile: null,
    authorizedProfiles: ["zh-TW"],
  });
});
