#!/usr/bin/env node
import {
  getShotRecipe,
  searchShotLibrary,
  shotLibraryStats,
} from "../../lib/shot-library.js";

function usage(): never {
  throw new Error(
    "usage: shot-catalog <stats|search <query>|show <recipe-id> <style-id>>",
  );
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);

  if (command === "stats" && args.length === 0) {
    process.stdout.write(`${JSON.stringify(shotLibraryStats(), null, 2)}\n`);
    return;
  }

  if (command === "search" && args.length > 0) {
    process.stdout.write(
      `${JSON.stringify(searchShotLibrary(args.join(" ")), null, 2)}\n`,
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
            source: undefined,
          },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  usage();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[video-shot-catalog] ${message}\n`);
  process.exitCode = 2;
}
