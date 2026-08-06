import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext } from "../scripts/checks/runtime-context.mjs";

test("JVM context consolidates Kotlin and framework facts", () => {
  const root = mkdtempSync(join(tmpdir(), "jvm-context-"));
  try { writeFileSync(join(root, "build.gradle.kts"), 'plugins { kotlin("jvm") version "2.2.0"; id("org.springframework.boot") version "3.5.0" }\njava { sourceCompatibility = JavaVersion.VERSION_21 }\n'); const context = environmentContext({ cwd: root }); assert.match(context, /Kotlin 2\.2\.0/u); assert.match(context, /Spring Boot/u); assert.match(context, /21/u); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
