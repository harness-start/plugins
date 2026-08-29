#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  getShotRecipe,
  searchShotLibrary,
  shotLibraryStats
} from "./chunk-GOOWI2FX.mjs";
import "./chunk-HL4EEBT7.mjs";

// plugins/artifact-production/src/domains/video/entries/cli/shot-catalog.ts
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
