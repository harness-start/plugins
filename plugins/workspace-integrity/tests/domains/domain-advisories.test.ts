import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { DomainEngineeringPolicy } from "@harness/core/domain-engineering-hook";
import { policy as android } from "../../src/domains/android/policy.js";
import { policy as ios } from "../../src/domains/ios/policy.js";
import { policy as java } from "../../src/domains/java/policy.js";
import { policy as kubernetes } from "../../src/domains/kubernetes/policy.js";
import { policy as rust } from "../../src/domains/rust/policy.js";

function codes(policy: DomainEngineeringPolicy, id: string, filePath: string, source: string): string[] {
  const scan = policy.sourceScans?.find((candidate) => candidate.id === id);
  assert.ok(scan, id);
  assert.equal(scan.enforcement, "advisory");
  return scan.inspect(filePath, source).map((hit) => hit.code);
}

test("Android R8 advisories report broad rules but ignore comments and scoped rules", () => {
  assert.deepEqual(codes(android, "r8BroadKeep", "proguard-rules.pro", "-keep class ** { *; }\n"), ["R8_BROAD_KEEP"]);
  assert.deepEqual(codes(android, "r8GlobalDontWarn", "proguard-rules.pro", "-dontwarn **\n"), ["R8_GLOBAL_DONTWARN"]);
  assert.deepEqual(codes(android, "r8BroadKeep", "proguard-rules.pro", "# -keep class ** { *; }\n-keepclassmembers class com.example.Model { <fields>; }\n"), []);
});

test("iOS advisories report concurrency escapes but ignore comments and strings", () => {
  const actual = "struct Cache: @unchecked Sendable {}\nnonisolated(unsafe) var shared = 0\nTask.detached { work() }\n";
  assert.deepEqual(codes(ios, "swiftConcurrencyEscapes", "Cache.swift", actual), [
    "SWIFT_UNCHECKED_SENDABLE",
    "SWIFT_NONISOLATED_UNSAFE",
    "SWIFT_TASK_DETACHED",
  ]);
  assert.deepEqual(codes(ios, "swiftConcurrencyEscapes", "Cache.swift", "// Task.detached {}\nlet note = \"@unchecked Sendable\"\nTask { work() }\n"), []);
});

test("Java javax advisory requires Spring Boot 3 or Jakarta build evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "java-jakarta-advisory-"));
  const sourceDir = join(root, "src", "main", "java");
  mkdirSync(sourceDir, { recursive: true });
  const sourcePath = join(sourceDir, "Example.java");
  writeFileSync(join(root, "pom.xml"), "<parent><artifactId>spring-boot-starter-parent</artifactId><version>3.3.1</version></parent>\n");
  assert.deepEqual(codes(java, "legacyJavaxOnJakarta", sourcePath, "import javax.persistence.Entity;\n"), ["LEGACY_JAVAX_ON_JAKARTA"]);
  assert.deepEqual(codes(java, "legacyJavaxOnJakarta", sourcePath, "// import javax.persistence.Entity;\nString note = \"javax.persistence.Entity\";\n"), []);
  writeFileSync(join(root, "pom.xml"), "<parent><artifactId>spring-boot-starter-parent</artifactId><version>2.7.18</version></parent>\n");
  assert.deepEqual(codes(java, "legacyJavaxOnJakarta", sourcePath, "import javax.persistence.Entity;\n"), []);
});

test("Kubernetes advisories report mutable images and privilege settings only as keys", () => {
  const source = "apiVersion: v1\nkind: Pod\nspec:\n  hostNetwork: true\n  containers:\n    - image: example/api:latest\n      securityContext:\n        privileged: true\n        allowPrivilegeEscalation: true\n";
  assert.deepEqual(codes(kubernetes, "kubernetesRiskyDefaults", "pod.yaml", source), [
    "K8S_HOST_NAMESPACE",
    "K8S_MUTABLE_IMAGE",
    "K8S_PRIVILEGED",
    "K8S_PRIVILEGE_ESCALATION",
  ]);
  assert.deepEqual(codes(kubernetes, "kubernetesRiskyDefaults", "pod.yaml", "# privileged: true\nmetadata:\n  annotations:\n    note: \"image: api:latest\"\nspec:\n  containers:\n    - image: api@sha256:abcdef\n"), []);
});

test("Rust advisory requires a nearby SAFETY explanation and ignores comments and strings", () => {
  assert.deepEqual(codes(rust, "unsafeWithoutSafety", "src/lib.rs", "unsafe fn raw() {}\nlet value = unsafe { read() };\n"), ["UNEXPLAINED_UNSAFE", "UNEXPLAINED_UNSAFE"]);
  assert.deepEqual(codes(rust, "unsafeWithoutSafety", "src/lib.rs", "// SAFETY: pointer was validated above.\nlet value = unsafe { read() };\nlet note = \"unsafe { fake() }\";\n// unsafe fn fake() {}\n"), []);
});
