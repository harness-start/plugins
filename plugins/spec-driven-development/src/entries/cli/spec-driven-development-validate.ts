#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { digestText, inspectChange } from "../../lib/artifacts.js";

const [command, target] = process.argv.slice(2);

if (command === "digest" && target) {
  process.stdout.write(`${digestText(readFileSync(target, "utf8"))}\n`);
} else if (command === "validate" && target) {
  const result = inspectChange(target);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.findings.length === 0 ? 0 : 1;
} else {
  process.stderr.write("usage: spec-driven-development-validate.mjs digest <artifact> | validate <change-dir>\n");
  process.exitCode = 2;
}
