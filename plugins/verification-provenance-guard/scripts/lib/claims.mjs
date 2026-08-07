const ZERO_WIDTH_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;
const NEGATED = /(?:尚未|还未|未|没有|没|不|failed|failure|error|not\s+pass|did\s+not\s+pass|not\s+successful)/iu;
const VALIDATION = /(?:phpstan|phpunit|pytest|eslint|ruff|type[- ]?check|lint|unit tests?|tests?|单元测试|测试|静态分析|类型检查)[^\n]{0,40}?(?:全部)?(?:通过|成功|全绿|pass(?:ed)?|success)/iu;
const CI = /(?:gitlab|github|ci|pipeline|流水线)[^\n]{0,60}?(?:通过|成功|全绿|pass(?:ed)?|success)/iu;
const ARTIFACT = /(?:报告|报表|产物|文件|artifact|report|export)[^\n]{0,60}?(?:已)?(?:生成|创建|保存|导出|写入|generated|created|saved|exported|written)[^\n]{0,80}?(?:`[^`]+`|\[[^\]]+\]\([^)]+\)|[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]{1,12})/iu;
const GIT = /(?:commit|push|merge|merged|提交|推送|合并)[^\n]{0,50}?(?:完成|成功|已合并|succeeded|success)/iu;

function proseOnly(text) {
  const lines = String(text ?? "").split(/\r?\n/u);
  const kept = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/u.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence || /^\s*>/u.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").normalize("NFKC").replace(ZERO_WIDTH_AND_BIDI, "");
}

function matches(pattern, line) {
  pattern.lastIndex = 0;
  return pattern.test(line);
}

export function detectUnsupportedClaims(text, additionalPatterns = []) {
  const prose = proseOnly(text);
  const findings = [];
  for (const line of prose.split(/\r?\n/u)) {
    if (NEGATED.test(line)) continue;
    if (VALIDATION.test(line) && !findings.includes("validation")) findings.push("validation");
    if (CI.test(line) && !findings.includes("ci")) findings.push("ci");
    if (ARTIFACT.test(line) && !findings.includes("artifact")) findings.push("artifact");
    if (GIT.test(line) && !findings.includes("git")) findings.push("git");
    if (additionalPatterns.some((pattern) => matches(pattern, line)) && !findings.includes("custom")) findings.push("custom");
  }
  return findings;
}
