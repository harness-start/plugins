#!/usr/bin/env node
// harness-source-hash: sha256:08625fda2d553e71ba4e9c140e5f204d9e77991fac124216b8aba483d7dc7cf3
import {
  digestText,
  inspectChange
} from "../chunks/chunk-X7YOTVCU.mjs";

// plugins/engineering-workflow/modules/specification/src/entries/cli/spec-driven-development-validate.ts
import { readFileSync } from "node:fs";
var [command, target] = process.argv.slice(2);
if (command === "digest" && target) {
  process.stdout.write(`${digestText(readFileSync(target, "utf8"))}
`);
} else if (command === "validate" && target) {
  const result = inspectChange(target);
  process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
  process.exitCode = result.findings.length === 0 ? 0 : 1;
} else {
  process.stderr.write("usage: spec-driven-development-validate.mjs digest <artifact> | validate <change-dir>\n");
  process.exitCode = 2;
}
