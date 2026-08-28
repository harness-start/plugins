import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyLanguageIntent } from "../src/lib/intent.js";
import {
  detectLanguageDrift,
  stripNonProseMarkdown,
} from "../src/lib/language-drift.js";
import { PROFILE_IDS } from "../src/lib/profiles.js";

const SAMPLES = {
  han: "这是十二个以上的中文汉字内容用于检测",
  hangul: "가나다라마바사아자차카타",
  kana: "あいうえおかきくけこさし",
  thai: "กขคฆงจฉชซฌญฎ",
};

const SIMPLIFIED_HAN = SAMPLES.han;
const TRADITIONAL_HAN = "這是十二個以上的中文漢字內容用於檢測";
const JAPANESE_PROSE = "設定を保存してからテストを実行してください。";
const SHARED_HAN = "一二三四五六七八九十是的人不大小上下";

const EXPECTED_DRIFT = {
  "zh-CN": ["hangul", "kana", "thai"],
  "zh-TW": ["han", "hangul", "kana", "thai"],
  "en-US": ["han", "hangul", "kana", "thai"],
  "ja-JP": ["han", "hangul", "thai"],
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

test("zh-CN reports Traditional Chinese Han as drift and keeps Simplified Chinese", () => {
  const traditional = detectLanguageDrift(TRADITIONAL_HAN, { preferredProfile: "zh-CN" });
  assert.equal(traditional[0]?.script, "han-traditional");
  assert.ok(traditional[0].scriptCharacters >= 3);
  assert.deepEqual(detectLanguageDrift(SIMPLIFIED_HAN, { preferredProfile: "zh-CN" }), []);
});

test("zh-TW reports Simplified Chinese Han as drift and keeps Traditional Chinese", () => {
  const simplified = detectLanguageDrift(SIMPLIFIED_HAN, { preferredProfile: "zh-TW" });
  assert.equal(simplified[0]?.script, "han-simplified");
  assert.ok(simplified[0].scriptCharacters >= 3);
  assert.deepEqual(detectLanguageDrift(TRADITIONAL_HAN, { preferredProfile: "zh-TW" }), []);
});

test("shared Han without simplified or traditional variants is not orthography drift", () => {
  assert.deepEqual(detectLanguageDrift(SHARED_HAN, { preferredProfile: "zh-CN" }), []);
  assert.deepEqual(detectLanguageDrift(SHARED_HAN, { preferredProfile: "zh-TW" }), []);
});

test("ja-JP reports Chinese Han without kana as drift and keeps Japanese prose", () => {
  const chinese = detectLanguageDrift(SIMPLIFIED_HAN, { preferredProfile: "ja-JP" });
  assert.equal(chinese[0]?.script, "han-chinese");
  assert.deepEqual(detectLanguageDrift(JAPANESE_PROSE, { preferredProfile: "ja-JP" }), []);
  assert.deepEqual(detectLanguageDrift(TRADITIONAL_HAN, { preferredProfile: "ja-JP" })[0]?.script, "han-chinese");
});

test("authorizing the other Chinese profile lifts Han orthography drift", () => {
  assert.deepEqual(
    detectLanguageDrift(TRADITIONAL_HAN, {
      preferredProfile: "zh-CN",
      authorizedProfiles: ["zh-TW"],
    }),
    [],
  );
  assert.deepEqual(
    detectLanguageDrift(SIMPLIFIED_HAN, {
      preferredProfile: "zh-TW",
      authorizedProfiles: ["zh-CN"],
    }),
    [],
  );
});

test("authorizing a Chinese profile on ja-JP allows Chinese Han without kana", () => {
  assert.deepEqual(
    detectLanguageDrift(SIMPLIFIED_HAN, {
      preferredProfile: "ja-JP",
      authorizedProfiles: ["zh-CN"],
    }),
    [],
  );
});

test("Han orthography drift still ignores fenced Traditional Chinese", () => {
  assert.deepEqual(
    detectLanguageDrift(`\`\`\`text\n${TRADITIONAL_HAN}\n\`\`\``, { preferredProfile: "zh-CN" }),
    [],
  );
});

test("fewer than three distinctive variant characters is not orthography drift", () => {
  assert.deepEqual(
    detectLanguageDrift("這個字是的人不大小上下中文", { preferredProfile: "zh-CN" }),
    [],
  );
});

test("one kana character does not count as Japanese prose", () => {
  assert.equal(
    detectLanguageDrift(`${SIMPLIFIED_HAN}あ`, { preferredProfile: "ja-JP" })[0]?.script,
    "han-chinese",
  );
});
