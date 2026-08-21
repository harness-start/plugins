#!/usr/bin/env node
// harness-source-hash: sha256:22e6392dba932aa10bf2d78c5055d1132ad4854afa015de40b48561ff079fa07
import {
  getShotRecipe,
  searchShotLibrary,
  shotLibraryStats
} from "../chunks/chunk-QGO6LRUV.mjs";

// plugins/video-production/src/entries/cli/shot-catalog.ts
function usage() {
  throw new Error(
    "usage: shot-catalog <stats|search <query>|show <recipe-id> <style-id>>"
  );
}
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "stats" && args.length === 0) {
    process.stdout.write(`${JSON.stringify(shotLibraryStats(), null, 2)}
`);
    return;
  }
  if (command === "search" && args.length > 0) {
    process.stdout.write(
      `${JSON.stringify(searchShotLibrary(args.join(" ")), null, 2)}
`
    );
    return;
  }
  if (command === "show" && args.length === 2) {
    const [recipeId = "", styleId = ""] = args;
    const selected = getShotRecipe(recipeId, styleId);
    process.stdout.write(
      `${JSON.stringify(
        {
          recipe: selected.recipe,
          style: {
            ...selected.style,
            source: void 0
          }
        },
        null,
        2
      )}
`
    );
    return;
  }
  usage();
}
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[video-shot-catalog] ${message}
`);
  process.exitCode = 2;
}
