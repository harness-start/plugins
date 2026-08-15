#!/usr/bin/env node
// harness-source-hash: sha256:019842eddaaaa3200c327f3d06f42b3a86e3f7fcb3fbd566c1556b872f0d609c
import {
  digestText,
  inspectChange
} from "../chunks/chunk-B3QED6YW.mjs";

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
