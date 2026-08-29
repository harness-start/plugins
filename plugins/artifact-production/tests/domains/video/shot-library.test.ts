import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  SHOT_LIBRARY_UPSTREAM_COMMIT,
  getShotRecipe,
  searchShotLibrary,
  shotLibraryStats,
  shotSourceFiles,
} from "../../../src/domains/video/lib/shot-library.js";

test("bundled shot catalog exposes the pinned upstream inventory", () => {
  assert.equal(SHOT_LIBRARY_UPSTREAM_COMMIT, "0d6f0b57f0d4d6700761644c07f7ef03c3e50234");
  assert.deepEqual(shotLibraryStats(), {
    cards: 152,
    styles: 209,
    categories: 10,
  });
});

test("catalog lookup returns the exact recipe and style source", () => {
  const result = getShotRecipe("deck-deal-flyin", "deck-deal-flyin");

  assert.equal(result.recipe.id, "deck-deal-flyin");
  assert.equal(result.style.id, "deck-deal-flyin");
  assert.match(result.recipe.markdown, /## 参数表/u);
  assert.match(result.style.source, /export/u);
  assert.match(result.style.upstreamPath, /\.tsx$/u);
});

test("catalog lookup rejects unknown identifiers without treating them as paths", () => {
  assert.throws(
    () => getShotRecipe("../../etc/passwd", "deck-deal-flyin"),
    /SHOT_RECIPE_UNKNOWN/u,
  );
});

test("shot catalog CLI returns a machine-readable exact style", () => {
  const entry = fileURLToPath(new URL("../../../src/domains/video/entries/cli/shot-catalog.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", entry, "show", "deck-deal-flyin", "deck-deal-flyin"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { recipe: { id: string }; style: { id: string; sourceSha256: string } };
  assert.equal(output.recipe.id, "deck-deal-flyin");
  assert.equal(output.style.id, "deck-deal-flyin");
  assert.match(output.style.sourceSha256, /^[a-f0-9]{64}$/u);
});

test("all executable snapshots are offline, deterministic text sources", () => {
  const recipes = searchShotLibrary("");
  const paths = [...new Set(recipes.flatMap((recipe) => recipe.styles.flatMap((style) => style.dependencyPaths)))];
  const sources = shotSourceFiles(paths);

  assert.ok(paths.length >= 200);
  assert.equal(paths.some((path) => /\.(?:mp3|wav|png|jpe?g|webp|mp4|mov)$/iu.test(path)), false);
  for (const [path, source] of Object.entries(sources)) {
    const code = source.replace(/\/\/.*$/gmu, "").replace(/\/\*[\s\S]*?\*\//gu, "");
    assert.doesNotMatch(code, /\b(?:Math\.random|Date\.now|fetch|XMLHttpRequest|WebSocket|staticFile)\s*\(/u, path);
  }
});
