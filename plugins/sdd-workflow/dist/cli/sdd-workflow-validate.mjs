#!/usr/bin/env node
// harness-source-hash: sha256:e8e3b6cbf6e71c64f442000ef3064fdc50861517e78f5ef9b8a7ebf4dc78879d
import {
  digestText,
  inspectChange
} from "../chunks/chunk-XZYMORRN.mjs";

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
