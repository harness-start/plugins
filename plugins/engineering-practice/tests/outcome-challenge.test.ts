import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryGuardFinding,
  diagnosticContractRewriteFinding,
  mixedBoundaryFreshEmptyFinding,
  mixedBoundarySynthesisFinding,
  mixedBoundaryRejectionFinding,
  orderingPrimitiveFinding,
  partialCompositionMigrationFinding,
  parallelCompositionSeamFinding,
  variadicCycleFallbackFinding,
  variadicDiagnosticFinding,
  variadicFlattenedDiagnosticFinding,
  variadicNovelDiagnosticStyleFinding,
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

test("flags fresh per-component empties returned after a lossy transform despite an earlier all-empty guard", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,11 @@ def convert(parts):
+    if all(part.size == 0 for part in parts):
+        return [array([]) for _ in parts]
     parts = broadcast_components(*parts)
     matrix = stack(parts)
+    if matrix.size == 0:
+        return [array([]) for _ in parts]
     return engine(matrix)
 `;

  assert.deepEqual(mixedBoundaryFreshEmptyFinding(diff), {
    code: "mixed-boundary-fresh-empty",
    path: "src/coordinates.py",
    line: 15,
    transform: "broadcast_components",
  });
});

test("accepts returning the original components before a lossy transform without a fresh-empty detour", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,5 +10,8 @@ def convert(parts):
+    if any(part.size == 0 for part in parts):
+        return list(parts)
     parts = broadcast_components(*parts)
     return engine(parts)
 `;

  assert.equal(mixedBoundaryFreshEmptyFinding(diff), null);
});

test("does not carry a lossy transform into a separate function hidden behind the next diff hunk", () => {
  const diff = `diff --git a/src/coordinates.py b/src/coordinates.py
--- a/src/coordinates.py
+++ b/src/coordinates.py
@@ -10,4 +10,6 @@ def convert_components(parts):
+    if any(part.size == 0 for part in parts):
+        return list(parts)
     parts = broadcast_components(*parts)
     return engine(parts)
@@ -30,3 +32,6 @@ def convert_matrix(matrix):
+    if matrix.size == 0:
+        return array([])
     return matrix_engine(matrix)
 `;

  assert.equal(mixedBoundaryFreshEmptyFinding(diff), null);
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

test("flags a container-sensitive result derived inside a one-input variadic branch", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,3 +5,13 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        if len(chains) == 1:
+            chain = chains[0]
+            unique = []
+            for item in chain:
+                if item not in unique:
+                    unique.append(item)
+            if isinstance(chain, tuple):
+                return tuple(unique)
+            return unique
         return stable_order(chains)
 `;

  assert.deepEqual(variadicSeamBypassFinding(diff), {
    code: "variadic-single-input-bypass",
    path: "src/registry.py",
    line: 13,
    parameter: "chains",
  });
});

test("accepts a one-input branch that still invokes the shared mechanism with the complete group collection", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,3 +5,6 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        if len(chains) == 1:
+            return stable_order(chains)
         return stable_order(chains)
 `;

  assert.equal(variadicSeamBypassFinding(diff), null);
});

test("flags a sibling composition consumer left on pairwise accumulation after a variadic migration", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,12 +5,9 @@ class Registry:
     def primary(self):
-        result = self._chains[0]
-        for chain in self._chains[1:]:
-            result = self.combine(result, chain)
-        return result
+        return self.combine(*self._chains)

     def secondary(self):
         result = self._fallback_chains[0]
         for chain in self._fallback_chains[1:]:
             result = self.combine(result, chain)
         return result
@@ -30,2 +27,2 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
         return stable_order(chains)
 `;

  assert.deepEqual(partialCompositionMigrationFinding(diff), {
    code: "partial-composition-migration",
    path: "src/registry.py",
    line: 11,
    seam: "combine",
  });
});

test("accepts migrating every aggregate consumer through the variadic public seam", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,14 +5,8 @@ class Registry:
     def primary(self):
-        result = self._chains[0]
-        for chain in self._chains[1:]:
-            result = self.combine(result, chain)
-        return result
+        return self.combine(*self._chains)

     def secondary(self):
-        result = self._fallback_chains[0]
-        for chain in self._fallback_chains[1:]:
-            result = self.combine(result, chain)
-        return result
+        return self.combine(*self._fallback_chains)
@@ -30,2 +24,2 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
         return stable_order(chains)
 `;

  assert.equal(partialCompositionMigrationFinding(diff), null);
});

test("flags a JavaScript class consumer left pairwise after its static seam becomes variadic", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -5,12 +5,9 @@ export class Registry {
   get primary() {
-    let result = this.chains[0];
-    for (const chain of this.chains.slice(1)) result = Registry.combine(result, chain);
-    return result;
+    return Registry.combine(...this.chains);
   }
   get secondary() {
     let result = this.fallbackChains[0];
     for (const chain of this.fallbackChains.slice(1)) result = Registry.combine(result, chain);
     return result;
   }
-  static combine(left, right) { return pairwiseOrder(left, right); }
+  static combine(...chains) { return stableOrder(chains); }
 }
 `;

  assert.deepEqual(partialCompositionMigrationFinding(diff), {
    code: "partial-composition-migration",
    path: "src/registry.js",
    line: 10,
    seam: "combine",
  });
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

test("flags a variadic cycle fallback that discards every group except the first", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,10 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains")
+            return list(chains[0])
 `;

  assert.deepEqual(variadicCycleFallbackFinding(diff), {
    code: "variadic-cycle-first-input-fallback",
    path: "src/registry.py",
    line: 25,
    parameter: "chains",
  });
});

test("accepts a cycle fallback that retains unique items from every caller group", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,10 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        items = unique(chain.from_iterable(chains))
+        try:
+            return stable_order(items, graph)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % (chains,))
+            return items
 `;

  assert.equal(variadicCycleFallbackFinding(diff), null);
});

test("does not carry variadic cycle state into another function", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,12 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        return stable_order(groups)
+
+    def recover_pair(groups):
+        try:
+            return pairwise_order(groups)
+        except DependencyCycleError:
+            return list(groups[0])
 `;

  assert.equal(variadicCycleFallbackFinding(diff), null);
});

test("flags a JavaScript class variadic cycle fallback that keeps only its first group", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -20,3 +20,10 @@ export class Registry {
-  static combine(left, right) {
+  static combine(...groups) {
+    try {
+      return stableOrder(groups);
+    } catch (DependencyCycleError) {
+      warn("conflict");
+      return Array.from(groups[0]);
+    }
   }
 `;

  assert.deepEqual(variadicCycleFallbackFinding(diff), {
    code: "variadic-cycle-first-input-fallback",
    path: "src/registry.js",
    line: 25,
    parameter: "groups",
  });
});

test("flags a variadic diagnostic that flattens each caller group into member text", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,13 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            conflicting_chains = [chain for chain in groups if len(chain) > 1]
+            warnings.warn(
+                "Conflicting chains:\\n%s" % "\\n".join(
+                    ", ".join(str(item) for item in chain)
+                    for chain in conflicting_chains
+                )
+            )
`;

  assert.deepEqual(variadicFlattenedDiagnosticFinding(diff), {
    code: "variadic-flattened-diagnostic",
    path: "src/registry.py",
    line: 25,
    parameter: "groups",
  });
});

test("accepts a variadic diagnostic that formats complete caller groups with their collection boundaries", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % ", ".join(str(chain) for chain in chains))
 `;

  assert.equal(variadicFlattenedDiagnosticFinding(diff), null);
});

test("flags a lexical connector invented for peer caller groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % " and ".join(repr(chain) for chain in chains))
 `;

  assert.deepEqual(variadicNovelDiagnosticStyleFinding(diff), {
    code: "variadic-novel-diagnostic-style",
    path: "src/registry.py",
    line: 24,
    parameter: "chains",
    style: "lexical-connector",
  });
});

test("flags a JavaScript lexical connector invented for peer caller groups", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -20,3 +20,9 @@ export class Registry {
-  static combine(left, right) {
+  static combine(...groups) {
+    try {
+      return stableOrder(groups);
+    } catch (DependencyCycleError) {
+      console.warn("Conflicting groups: " + groups.map(String).join(" vs "));
+    }
 `;

  assert.deepEqual(variadicNovelDiagnosticStyleFinding(diff), {
    code: "variadic-novel-diagnostic-style",
    path: "src/registry.js",
    line: 24,
    parameter: "groups",
    style: "lexical-connector",
  });
});

test("flags a multiline layout invented for peer caller groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups:\\n%s" % ", ".join(repr(group) for group in groups))
 `;

  assert.deepEqual(variadicNovelDiagnosticStyleFinding(diff), {
    code: "variadic-novel-diagnostic-style",
    path: "src/registry.py",
    line: 24,
    parameter: "groups",
    style: "multiline-peer-operands",
  });
});

test("flags a legacy internal-item multiline layout reused for complete caller groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,8 +20,9 @@ class Registry:
-    def combine(left, right):
-        warnings.warn("Conflicting items:\\n%s\\n%s" % (left[-1], right[0]))
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups:\\n%s" % ", ".join(repr(group) for group in groups))
 `;

  assert.deepEqual(variadicNovelDiagnosticStyleFinding(diff), {
    code: "variadic-novel-diagnostic-style",
    path: "src/registry.py",
    line: 24,
    parameter: "groups",
    style: "multiline-peer-operands",
  });
});

test("accepts one-line punctuation between peer caller groups", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups: %s" % ", ".join(repr(group) for group in groups))
 `;

  assert.equal(variadicNovelDiagnosticStyleFinding(diff), null);
});

test("accepts a peer-group connector retained from the original diagnostic", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,5 +20,9 @@ class Registry:
-    def combine(left, right):
-        warnings.warn("Conflicting chains: %s" % " versus ".join((repr(left), repr(right))))
+    def combine(*chains):
+        try:
+            return stable_order(chains)
+        except DependencyCycleError:
+            warnings.warn("Conflicting chains: %s" % " versus ".join(repr(chain) for chain in chains))
 `;

  assert.equal(variadicNovelDiagnosticStyleFinding(diff), null);
});

test("does not treat a connector from an unrelated removed diagnostic as local style evidence", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -5,3 +5,2 @@ def validate(left, right):
-    warnings.warn("Invalid values: %s" % " and ".join((repr(left), repr(right))))
     return True
@@ -20,3 +19,9 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups: %s" % " and ".join(repr(group) for group in groups))
 `;

  assert.deepEqual(variadicNovelDiagnosticStyleFinding(diff), {
    code: "variadic-novel-diagnostic-style",
    path: "src/registry.py",
    line: 23,
    parameter: "groups",
    style: "lexical-connector",
  });
});

test("flags rewriting an existing complete-peer diagnostic delimiter during a variadic migration", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,7 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups: %s" % ", ".join(repr(group) for group in groups))
diff --git a/tests/test_registry.py b/tests/test_registry.py
--- a/tests/test_registry.py
+++ b/tests/test_registry.py
@@ -40,3 +40,3 @@ def test_cycle_warning():
-    assert warning == "Conflicting groups: [1, 2] <> [2, 1]"
+    assert warning == "Conflicting groups: [1, 2], [2, 1]"
 `;

  assert.deepEqual(diagnosticContractRewriteFinding(diff), {
    code: "diagnostic-contract-rewrite",
    path: "tests/test_registry.py",
    line: 40,
    before: "<>",
    after: ",",
  });
});

test("flags contract rewriting when a variadic seam delegates diagnostic formatting to a helper", () => {
  const diff = `diff --git a/src/registry.js b/src/registry.js
--- a/src/registry.js
+++ b/src/registry.js
@@ -20,3 +20,10 @@ export class Registry {
-  static combine(left, right) {
+  static combine(...groups) {
+    try {
+      return stableOrder(groups);
+    } catch (error) {
+      Registry.warnings.push(Registry.conflictMessage(groups));
+    }
+  }
+  static conflictMessage(groups) {
+    return "Conflicting groups: " + groups.map(String).join(", ");
diff --git a/tests/registry.test.js b/tests/registry.test.js
--- a/tests/registry.test.js
+++ b/tests/registry.test.js
@@ -40,3 +40,3 @@ test("cycle warning", () => {
-  assert.equal(warning, "Conflicting groups: [1, 2] <> [2, 1]");
+  assert.equal(warning, "Conflicting groups: [1, 2], [2, 1]");
 `;

  assert.deepEqual(diagnosticContractRewriteFinding(diff), {
    code: "diagnostic-contract-rewrite",
    path: "tests/registry.test.js",
    line: 40,
    before: "<>",
    after: ",",
  });
});

test("accepts adding a new complete-peer diagnostic assertion without rewriting baseline evidence", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,7 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        try:
+            return stable_order(groups)
+        except DependencyCycleError:
+            warnings.warn("Conflicting groups: %s" % ", ".join(repr(group) for group in groups))
diff --git a/tests/test_registry.py b/tests/test_registry.py
--- a/tests/test_registry.py
+++ b/tests/test_registry.py
@@ -40,2 +40,5 @@ def test_regular_order():
     assert combine([1], [2]) == [1, 2]
+
+def test_cycle_warning():
+    assert warning == "Conflicting groups: [1, 2], [2, 1]"
 `;

  assert.equal(diagnosticContractRewriteFinding(diff), null);
});

test("does not carry a variadic parameter into another function's nested text renderer", () => {
  const diff = `diff --git a/src/registry.py b/src/registry.py
--- a/src/registry.py
+++ b/src/registry.py
@@ -20,3 +20,11 @@ class Registry:
-    def combine(left, right):
+    def combine(*groups):
+        return stable_order(groups)
+
+    def render_table(groups):
+        warnings.warn("table:\\n%s" % "\\n".join(
+            ", ".join(str(cell) for cell in row) for row in groups
+        ))
 `;

  assert.equal(variadicFlattenedDiagnosticFinding(diff), null);
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
