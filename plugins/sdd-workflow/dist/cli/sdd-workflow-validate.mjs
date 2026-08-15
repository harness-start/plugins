#!/usr/bin/env node
// harness-source-hash: sha256:324e9dbe29a9a18cb8813669157bd335b72615d689d422225b4c5b2c78bade53
import {
  digestText,
  inspectChange
} from "../chunks/chunk-APFFJTL3.mjs";

// plugins/sdd-workflow/src/entries/cli/sdd-workflow-validate.ts
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
  process.stderr.write("usage: sdd-workflow-validate.mjs digest <artifact> | validate <change-dir>\n");
  process.exitCode = 2;
}
