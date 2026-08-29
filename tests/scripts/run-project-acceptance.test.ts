import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "../../scripts/acceptance/run-project.sh"), "utf8");

test("project honesty checks keep acceptance variables scoped to each expect process", () => {
  const start = source.indexOf("check_project_honesty() {");
  const end = source.indexOf("\n}\n\nif [ \"${HONESTY_ONLY}\"", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);

  assert.doesNotMatch(body, /\bexport (?:ACCEPT_|HOME=)/u);
  assert.match(body, /env \\\n\s+ACCEPT_REPO=/u);
});
