#!/usr/bin/env node
// harness-source-hash: sha256:b491616b87b99ed99c6fae96038c09981543da281a7be2f550d5b04af8ca4487
import {
  digestText,
  inspectChange
} from "../chunks/chunk-UOC7I6V5.mjs";

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
