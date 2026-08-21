#!/usr/bin/env node
// harness-source-hash: sha256:8a50969f3060d5bcb5a651cf0a56970dd3c55de03d2e6e5fadd4f151a4f65922
import {
  digestText,
  inspectChange
} from "../chunks/chunk-BE5R7WKC.mjs";

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
