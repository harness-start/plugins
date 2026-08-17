import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { SHOT_LIBRARY_GZIP_BASE64 } from "../generated/shot-library-data.js";

export const SHOT_LIBRARY_UPSTREAM_COMMIT = "0d6f0b57f0d4d6700761644c07f7ef03c3e50234";
export const SHOT_LIBRARY_SCHEMA = "video-production/shot-library/v1";

export type ShotLibraryStyle = {
  id: string;
  label: string;
  description: string;
  status: "executable" | "reference-only";
  upstreamPath: string | null;
  sourceSha256: string | null;
  dependencyPaths: string[];
};

export type ShotLibraryRecipe = {
  id: string;
  category: string;
  tags: string[];
  summary: string;
  use: string;
  duration: string;
  energy: string;
  intention: string;
  markdown: string;
  upstreamPath: string;
  styles: ShotLibraryStyle[];
};

type ShotLibrary = {
  schema: string;
  upstream: { repository: string; commit: string; license: string };
  categories: string[];
  recipes: ShotLibraryRecipe[];
  files: Record<string, string>;
};

let cache: ShotLibrary | undefined;

function loadShotLibrary() {
  if (cache) return cache;
  const parsed: unknown = JSON.parse(gunzipSync(Buffer.from(SHOT_LIBRARY_GZIP_BASE64, "base64")).toString("utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SHOT_LIBRARY_INVALID");
  const library = parsed as Partial<ShotLibrary>;
  if (library.schema !== SHOT_LIBRARY_SCHEMA || library.upstream?.commit !== SHOT_LIBRARY_UPSTREAM_COMMIT || !Array.isArray(library.recipes) || !Array.isArray(library.categories) || library.files === null || typeof library.files !== "object") throw new Error("SHOT_LIBRARY_INVALID");
  cache = library as ShotLibrary;
  return cache;
}

export function shotLibraryStats() {
  const library = loadShotLibrary();
  return {
    cards: library.recipes.length,
    styles: library.recipes.reduce((total, recipe) => total + recipe.styles.length, 0),
    categories: library.categories.length,
  };
}

export function getShotRecipe(recipeId: string, styleId: string) {
  const library = loadShotLibrary();
  const recipe = library.recipes.find(({ id }) => id === recipeId);
  if (!recipe) throw new Error(`SHOT_RECIPE_UNKNOWN:${recipeId}`);
  const style = recipe.styles.find(({ id }) => id === styleId);
  if (!style) throw new Error(`SHOT_STYLE_UNKNOWN:${styleId}`);
  const source = style.upstreamPath ? library.files[style.upstreamPath] : undefined;
  if (style.status === "executable" && (!source || createHash("sha256").update(source).digest("hex") !== style.sourceSha256)) throw new Error(`SHOT_SOURCE_INVALID:${styleId}`);
  return { recipe, style: { ...style, source: source ?? "" } };
}

export function searchShotLibrary(query: string) {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return loadShotLibrary().recipes.filter((recipe) => {
    const haystack = [recipe.id, recipe.category, recipe.summary, recipe.use, recipe.energy, ...recipe.tags].join(" ").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function shotSourceFiles(paths: string[]) {
  const files = loadShotLibrary().files;
  const result: Record<string, string> = {};
  for (const path of paths) {
    const source = files[path];
    if (typeof source !== "string") throw new Error(`SHOT_SOURCE_UNKNOWN:${path}`);
    result[path] = source;
  }
  return result;
}
