import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../../..");
const gitlab = parse(readFileSync(resolve(root, ".gitlab-ci.yml"), "utf8")) as {
  [job: string]: {
    script?: string[];
    variables?: Record<string, string>;
  };
};
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function validationContract(): { groups: string[] } {
  const result = spawnSync("bash", ["scripts/ci/validate-plugins.sh", "--describe"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as { groups: string[] };
}

test("GitLab runs the real FFmpeg contract beside the main validation job", () => {
  const pluginJob = gitlab["validate:plugins"];
  const ffmpegJob = gitlab["validate:ffmpeg"];
  assert.ok(pluginJob);
  assert.ok(ffmpegJob);
  assert.equal(pluginJob.variables?.SKIP_REAL_FFMPEG_TESTS, "1");
  assert.deepEqual(pluginJob.script, ["bash scripts/ci/validate-plugins.sh"]);
  assert.deepEqual(ffmpegJob.script, ["npm run test:ffmpeg"]);
  assert.equal(Object.hasOwn(ffmpegJob.variables ?? {}, "SKIP_REAL_FFMPEG_TESTS"), false);
  assert.equal(
    packageJson.scripts["test:ffmpeg"],
    "tsx --test plugins/video-production/tests/media.test.ts plugins/brand-logo-production/tests/squint.test.ts",
  );
});

test("the main validator exposes its actual parallel execution groups", () => {
  assert.deepEqual(validationContract().groups, [
    "check_core_quality",
    "check_unit_and_acceptance",
    "check_host_marketplaces",
  ]);
});

test("the main job's FFmpeg skip is honored by the separately gated test files", () => {
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "plugins/video-production/tests/media.test.ts",
      "plugins/brand-logo-production/tests/squint.test.ts",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...childEnv, SKIP_REAL_FFMPEG_TESTS: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /# skipped [1-9][0-9]*/u);
});
