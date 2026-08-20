import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gitlab = readFileSync(new URL("../../../.gitlab-ci.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const validator = readFileSync(new URL("../../../scripts/ci/validate-plugins.sh", import.meta.url), "utf8");
const mediaTest = readFileSync(new URL("../../../plugins/video-production/tests/media.test.ts", import.meta.url), "utf8");

function yamlJob(config: string, name: string): string {
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line === `${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const endOffset = lines.slice(start + 1).findIndex((line) => /^[^\s#].*:\s*$/u.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join("\n");
}

function assertGitLabCoverage(config: string): void {
  const pluginJob = yamlJob(config, "validate:plugins");
  const ffmpegJob = yamlJob(config, "validate:ffmpeg");
  assert.match(pluginJob, /SKIP_REAL_FFMPEG_TEST: "1"/u);
  assert.match(ffmpegJob, /npm run test:ffmpeg/u);
  assert.doesNotMatch(ffmpegJob, /SKIP_REAL_FFMPEG_TEST/u);
}

function assertParallelGroups(script: string): void {
  const groupBlock = script.match(/local -a groups=\(\n([\s\S]*?)\n {2}\)/u);
  const groups = groupBlock?.[1];
  assert.ok(groups, "missing parallel validation groups");
  assert.deepEqual(groups.trim().split(/\s+/u), [
    "check_core_quality",
    "check_unit_tests",
    "check_acceptance_contracts",
    "check_host_marketplaces",
  ]);
  assert.match(script, /main\(\)[\s\S]*?run_parallel_validation/u);
}

test("GitLab runs the real FFmpeg contract beside the parallel validation job", () => {
  assertGitLabCoverage(gitlab);
  assert.equal(packageJson.scripts["test:ffmpeg"], "tsx --test plugins/video-production/tests/media.test.ts");

  const misplacedSkip = gitlab
    .replace('    SKIP_REAL_FFMPEG_TEST: "1"\n', "")
    .replace("validate:ffmpeg:\n", 'validate:ffmpeg:\n  variables:\n    SKIP_REAL_FFMPEG_TEST: "1"\n');
  assert.throws(() => assertGitLabCoverage(misplacedSkip));
});

test("the main validation preserves every gate while skipping only the separately gated media test", () => {
  assertParallelGroups(validator);
  assert.match(mediaTest, /SKIP_REAL_FFMPEG_TEST/u);

  const missingGroup = validator.replace("    check_host_marketplaces\n", "");
  assert.throws(() => assertParallelGroups(missingGroup));
});
