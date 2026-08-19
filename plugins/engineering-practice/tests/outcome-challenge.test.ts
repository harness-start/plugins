import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryGuardFinding,
  mixedBoundaryRejectionFinding,
  orderingPrimitiveFinding,
  variadicSeamBypassFinding,
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

test("flags a newly invented mixed-boundary rejection before a lossy transform", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,11 @@ def convert(parts):
+    empty = [part.size == 0 for part in parts]
+    if any(empty) and not all(empty):
+        raise ValueError("components cannot be combined")
     parts = broadcast_components(*parts)
     return engine(parts)
`;

  assert.deepEqual(mixedBoundaryRejectionFinding(diff), {
    code: "mixed-boundary-rejection",
    path: "src/coordinates.py",
    line: 12,
    transform: "broadcast_components",
  });
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

test("flags a before-after graph loop when a repository primitive exists", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -5,3 +5,14 @@ export function combine(chains) {
+  const before = new Map();
+  const after = new Map();
+  const ready = items.filter((item) => before.get(item).size === 0);
+  const merged = [];
+  while (ready.length) {
+    const item = ready.shift();
+    merged.push(item);
+    for (const dependent of after.get(item)) ready.push(dependent);
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

test("flags a raw single-input bypass added to a variadic composition seam", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,2 +5,2 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
         """Combine chains."""
@@ -15,2 +15,5 @@ class Registry:
+        if len(chains) == 1:
+            # A single chain needs no composition.
+            return chains[0]
         return stable_order(chains)
`;

  assert.deepEqual(variadicSeamBypassFinding(diff), {
    code: "variadic-single-input-bypass",
    path: "src/registry.py",
    line: 17,
    parameter: "chains",
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

test("ignores graph vocabulary that appears only in production strings and comments", () => {
  const diff = `diff --git a/src/messages.js b/src/messages.js
--- a/src/messages.js
+++ b/src/messages.js
@@ -1,2 +1,7 @@
+export function render(records) {
+  const guidance = "Check dependencies and the ready merged frontier before release";
+  // The topological successors example is documentation, not graph state.
+  for (const record of records) send(record);
+  return guidance;
+}
`;
  const candidates = ["src/stable-order.js:7:export function stableTopologicalSort(items, graph) {"];

  assert.equal(orderingPrimitiveFinding(diff, candidates), null);
});
