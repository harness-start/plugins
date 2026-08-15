#!/usr/bin/env node
// harness-source-hash: sha256:c8ec552415b90cbd7f90d64b58f8a5e36f463ae272ee86f95934562875a15576
import {
  digestText,
  inspectChange
} from "../chunks/chunk-45PNVDIH.mjs";

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
