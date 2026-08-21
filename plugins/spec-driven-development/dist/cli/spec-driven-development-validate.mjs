#!/usr/bin/env node
// harness-source-hash: sha256:87d4561f20ded1fbc93c96c9ede4e66465db7b42ea3c86885819b1c3b4610edc
import {
  digestText,
  inspectChange
} from "../chunks/chunk-FGPEGXVW.mjs";

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
