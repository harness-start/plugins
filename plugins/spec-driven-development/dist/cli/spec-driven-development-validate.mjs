#!/usr/bin/env node
// harness-source-hash: sha256:55a1266c595eb15a4f670c0b08821023916b02f9f32b955e6a3d497ede1777c3
import {
  digestText,
  inspectChange
} from "../chunks/chunk-73T76YYK.mjs";

// plugins/spec-driven-development/src/entries/cli/spec-driven-development-validate.ts
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
