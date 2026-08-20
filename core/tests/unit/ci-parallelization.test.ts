import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gitlab = readFileSync(new URL("../../../.gitlab-ci.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const validator = readFileSync(new URL("../../../scripts/ci/validate-plugins.sh", import.meta.url), "utf8");
const mediaTest = readFileSync(new URL("../../../plugins/video-production/tests/media.test.ts", import.meta.url), "utf8");

test("GitLab runs the real FFmpeg contract beside the parallel validation job", () => {
  assert.match(gitlab, /^validate:plugins:\n[\s\S]*?SKIP_REAL_FFMPEG_TEST: "1"/mu);
  assert.match(gitlab, /^validate:ffmpeg:\n[\s\S]*?npm run test:ffmpeg/mu);
  assert.equal(packageJson.scripts["test:ffmpeg"], "tsx --test plugins/video-production/tests/media.test.ts");
});

test("the main validation preserves every gate while skipping only the separately gated media test", () => {
  assert.match(validator, /run_parallel_validation/u);
  assert.match(validator, /check_core_quality/u);
  assert.match(validator, /check_unit_tests/u);
  assert.match(validator, /check_acceptance_contracts/u);
  assert.match(validator, /check_host_marketplaces/u);
  assert.match(mediaTest, /SKIP_REAL_FFMPEG_TEST/u);
});
