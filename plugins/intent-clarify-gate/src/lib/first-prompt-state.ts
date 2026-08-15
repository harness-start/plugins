import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { extractSessionId, platformDataRoot } from "./hook-io.js";

const VERSION = 1;

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function claimFirstPrompt(event, env = process.env, now = new Date()) {
  const sessionId = extractSessionId(event, env);
  const data = platformDataRoot(env);
  if (!sessionId || !data) {
    return {
      claimed: true,
      persisted: false,
      path: null,
      reason: "session identity or platform data root is unavailable; injecting without sticky state",
    };
  }

  const directory = join(data.root, "intent-clarify-gate", "first-prompts");
  const path = join(directory, `${digest(`${data.platform}:${sessionId}`)}.json`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    // Exclusive creation is the synchronization primitive for one injection per
    // session; parallel discovery workers never read or mutate this hook state.
    writeFileSync(path, `${JSON.stringify({ version: VERSION, injectedAt: now.toISOString() })}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return { claimed: true, persisted: true, path, reason: null };
  } catch (error) {
    if (error?.code === "EEXIST") {
      return { claimed: false, persisted: true, path, reason: null };
    }
    return {
      claimed: true,
      persisted: false,
      path,
      reason: `first-prompt state was not persisted: ${error?.message ?? String(error)}`,
    };
  }
}
