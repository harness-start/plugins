import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryGuardFinding,
  mixedBoundarySynthesisFinding,
  mixedBoundaryRejectionFinding,
  orderingPrimitiveFinding,
  parallelCompositionSeamFinding,
  variadicDiagnosticFinding,
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

test("flags synthesis of one shared empty aggregate from mixed caller components", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,13 @@ def convert(parts):
+    has_empty_component = any(part.size == 0 for part in parts)
     parts = broadcast_components(*parts)
     matrix = stack(parts)
-    output = engine(matrix)
+    if has_empty_component:
+        output = zeros((0, dimensions))
+    else:
+        output = engine(matrix)
     return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]
 `;

  assert.deepEqual(mixedBoundarySynthesisFinding(diff), {
    code: "mixed-boundary-shared-synthesis",
    path: "src/coordinates.py",
    line: 14,
    aggregate: "output",
  });
});

test("accepts preserving each original component before a lossy transform", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,8 @@ def convert(parts):
+    if any(part.size == 0 for part in parts):
+        return list(parts)
     parts = broadcast_components(*parts)
     return engine(parts)
 `;

  assert.equal(mixedBoundarySynthesisFinding(diff), null);
});

test("flags shared empty synthesis when component splitting follows return post-processing", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,9 +10,17 @@ def convert(parts):
+    is_empty = any(part.size == 0 for part in parts)
     parts = broadcast_components(*parts)
     matrix = stack(parts)
-    output = engine(matrix)
+    if is_empty:
+        output = numeric.zeros((0, dimensions))
+    else:
+        output = engine(matrix)
     if normalize_output:
         output = normalize(output)
         audit_normalized_component_layout(output, parts, dimensions)
         record_output_contract_for_each_component(output, parts, dimensions)
     return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]
 `;

  assert.deepEqual(mixedBoundarySynthesisFinding(diff), {
    code: "mixed-boundary-shared-synthesis",
    path: "src/coordinates.py",
    line: 14,
    aggregate: "output",
  });
});

test("flags shared empty synthesis split across nearby diff hunks", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,4 +10,5 @@ def convert(parts):
+    is_empty = any(part.size == 0 for part in parts)
     parts = broadcast_components(*parts)
     matrix = stack(parts)
@@ -18,5 +19,9 @@ def convert(parts):
-    output = engine(matrix)
+    if is_empty:
+        output = zeros((0, dimensions))
+    else:
+        output = engine(matrix)
     return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]
 `;

  assert.deepEqual(mixedBoundarySynthesisFinding(diff), {
    code: "mixed-boundary-shared-synthesis",
    path: "src/coordinates.py",
    line: 20,
    aggregate: "output",
  });
});

test("does not carry mixed-boundary state across nearby functions", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,4 +10,5 @@ def inspect(parts):
+    is_empty = any(part.size == 0 for part in parts)
     return broadcast_components(*parts)
@@ -18,4 +19,7 @@ def render(parts):
+    if is_empty:
+        output = zeros((0, dimensions))
+    return [output[:, index].reshape(part.shape) for index, part in enumerate(parts)]
 `;

  assert.equal(mixedBoundarySynthesisFinding(diff), null);
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

test("flags a dependency loop whose frontier uses result and ordered-item aliases", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,3 +5,14 @@ def combine(chains):
+    dependencies = {item: set() for item in items}
+    ordered_items = list(items)
+    result = []
+    while ordered_items:
+        for index, item in enumerate(ordered_items):
+            if dependencies[item].issubset(result):
+                break
+        result.append(item)
+        ordered_items.pop(index)
     return result
 `;
  const candidates = ["src/stable_order.py:7:def stable_topological_sort(items, graph):"];

  assert.deepEqual(orderingPrimitiveFinding(diff, candidates), {
    code: "repository-ordering-primitive-bypassed",
    path: "src/registry.py",
    candidate: "src/stable_order.py:7",
  });
});

test("flags a private multi-input helper added beside a fixed-arity public seam", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,8 +5,14 @@ class Registry:
     def combine(left, right):
-        return pairwise_order(left, right)
+        return Registry._combine_groups([left, right])

+    @staticmethod
+    def _combine_groups(groups):
+        return stable_order(groups)
+
+    def preview(self):
+        return self._combine_groups(self._preview_groups)

     def render(self):
-        return self.combine(self._groups[0], self._groups[1])
+        return self._combine_groups(self._groups)
 `;

  assert.deepEqual(parallelCompositionSeamFinding(diff), {
    code: "parallel-composition-seam",
    path: "src/registry.py",
    line: 9,
    helper: "_combine_groups",
    publicSeam: "combine",
  });
});

test("accepts extending the named composition seam itself", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,5 +5,5 @@ class Registry:
-    def combine(left, right):
-        return pairwise_order(left, right)
+    def combine(*groups):
+        return stable_order(groups)
 `;

  assert.equal(parallelCompositionSeamFinding(diff), null);
});

test("flags a private composition seam when the public signature is outside diff context", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,5 +5,5 @@ class Registry:
-        return self.combine(self._groups[0], self._groups[1])
+        return self._combine_groups(self._groups)
@@ -40,3 +40,8 @@ class Registry:
+    @staticmethod
+    def _combine_groups(groups):
+        return stable_order(groups)
@@ -80,3 +85,3 @@ class Registry:
-        return Registry.combine(left, right)
+        return Registry._combine_groups([left, right])
 `;

  assert.deepEqual(parallelCompositionSeamFinding(diff), {
    code: "parallel-composition-seam",
    path: "src/registry.py",
    line: 41,
    helper: "_combine_groups",
    publicSeam: "combine",
  });
});

test("accepts a private implementation detail when the named public seam is variadic", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,8 +5,14 @@ class Registry:
-    def combine(left, right):
-        return pairwise_order(left, right)
+    def combine(*groups):
+        return Registry._combine_groups(groups)

+    @staticmethod
+    def _combine_groups(groups):
+        return stable_order(groups)
+
+    def preview(self):
+        return self._combine_groups(self._preview_groups)

     def render(self):
-        return self.combine(self._groups[0], self._groups[1])
+        return self.combine(*self._groups)
 `;

  assert.equal(parallelCompositionSeamFinding(diff), null);
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

test("flags a raw single-input bypass moved into a variadic seam caller", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,2 +5,5 @@ class Registry:
+    if len(self._chains) == 1:
+        return self._chains[0]
     return self.combine(*self._chains)
@@ -20,2 +23,2 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
         return stable_order(chains)
`;

  assert.deepEqual(variadicSeamBypassFinding(diff), {
    code: "variadic-single-input-bypass",
    path: "src/registry.py",
    line: 6,
    parameter: "self._chains",
  });
});

test("does not join a single-input guard and unrelated return across distant hunks", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,2 +5,3 @@ class Registry:
+    if len(self._chains) == 1:
+        audit_single_chain(self._chains)
     return self.combine(*self._chains)
@@ -80,2 +81,3 @@ class Registry:
+    def preview(self):
+        return self._chains[0]
@@ -120,2 +122,2 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
         return stable_order(chains)
`;

  assert.equal(variadicSeamBypassFinding(diff), null);
});

test("flags a variadic cycle diagnostic that formats an extracted element pair", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,12 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            conflict = (previous, item)
+            warnings.warn(
+                "Conflicting chains:\\n%s\\n%s" % conflict,
+                ChainConflictWarning,
+            )
`;

  assert.deepEqual(variadicDiagnosticFinding(diff), {
    code: "variadic-internal-diagnostic",
    path: "src/registry.py",
    line: 26,
    variable: "conflict",
  });
});

test("accepts a variadic cycle diagnostic that formats the original input groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,11 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        original_chains = tuple(chains)
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % original_chains)
+            return fallback(chains)
`;

  assert.equal(variadicDiagnosticFinding(diff), null);
});

test("accepts a variadic cycle diagnostic that directly formats its input groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % chains)
+            return fallback(chains)
`;

  assert.equal(variadicDiagnosticFinding(diff), null);
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
