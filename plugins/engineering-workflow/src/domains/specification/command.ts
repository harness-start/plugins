#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { digestText, inspectChange } from "./lib/artifacts.js";

export function main(argv: string[] = process.argv.slice(2)): void {
  const [command, target] = argv;

  if (command === "digest" && target) {
    process.stdout.write(`${digestText(readFileSync(target, "utf8"))}\n`);
  } else if (command === "validate" && target) {
    const result = inspectChange(target);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.findings.length === 0 ? 0 : 1;
  } else {
    process.stderr.write("usage: harness spec check <change-dir>\n");
    process.exitCode = 2;
  }
}
