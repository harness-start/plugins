import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryGuardFinding,
  orderingPrimitiveFinding,
} from "../src/lib/outcome-challenge.js";

test("flags an empty short-circuit added after a lossy broadcast", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,8 @@ def convert(parts):
     parts = broadcast_components(*parts)
     matrix = stack(parts)
+    if matrix.size == 0:
+        return empty_result(matrix.shape)
     return engine(matrix)
`;

  assert.deepEqual(boundaryGuardFinding(diff), {
    code: "lossy-boundary-guard-order",
    path: "src/coordinates.py",
    line: 12,
    transform: "broadcast_components",
  });
});

test("accepts an empty guard before the lossy transform", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,8 @@ def convert(parts):
+    if any(part.size == 0 for part in parts):
+        return parts
     parts = broadcast_components(*parts)
     matrix = stack(parts)
     return engine(matrix)
`;

  assert.equal(boundaryGuardFinding(diff), null);
});

test("flags a hand-rolled dependency order when a repository primitive exists", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -5,3 +5,12 @@ export function combine(chains) {
+  const dependencies = new Map();
+  const emitted = new Set();
+  while (emitted.size < dependencies.size) {
+    const ready = [...dependencies].filter(([item, needs]) =>
+      !emitted.has(item) && [...needs].every((need) => emitted.has(need)));
+    emitted.add(ready[0][0]);
+  }
 }
`;
  const candidates = ["src/stable-order.js:7:export function stableTopologicalSort(items, graph) {"];

  assert.deepEqual(orderingPrimitiveFinding(diff, candidates), {
    code: "repository-ordering-primitive-bypassed",
    path: "src/registry.js",
    candidate: "src/stable-order.js:7",
  });
});

test("accepts reuse of the repository ordering primitive", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -1,3 +1,5 @@
+import { stableTopologicalSort } from "./stable-order.js";
+return stableTopologicalSort(items, graph);
`;
  const candidates = ["src/stable-order.js:7:export function stableTopologicalSort(items, graph) {"];

  assert.equal(orderingPrimitiveFinding(diff, candidates), null);
});

test("ignores ordering guidance text and acceptance-only primitive examples", () => {
  const diff = `diff --git a/src/hook.js b/src/hook.js
--- a/src/hook.js
+++ b/src/hook.js
@@ -1,2 +1,5 @@
+const guidance = "Check dependencies, the ready frontier, and topological cycle fallback before completion.";
+const message = "Use a for loop only if a local primitive cannot satisfy the contract; then break cycles explicitly.";
 export function run() {}
`;
  const candidates = [
    "acceptance/workspace/stable-order.js:1:export function stableTopologicalSort(items, graph) {",
  ];

  assert.equal(orderingPrimitiveFinding(diff, candidates), null);
});
