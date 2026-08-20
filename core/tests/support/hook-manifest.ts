import { readFileSync } from "node:fs";

export interface HookCommand {
  command: string;
  additionalContextLimit?: number;
  statusMessage?: string;
  timeout?: number;
  type: string;
}

export interface HookBinding {
  hooks?: HookCommand[];
  matcher?: string;
}

export interface HookManifest {
  hooks: Record<string, HookBinding[]>;
}

export function readHookManifest(path: string): HookManifest {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || !("hooks" in parsed)) {
    throw new TypeError(`Invalid hook manifest: ${path}`);
  }
  return parsed as HookManifest;
}

export function eventNames(manifest: HookManifest): string[] {
  return Object.keys(manifest.hooks).sort();
}

export function matcherTools(manifest: HookManifest, event: string): Set<string> {
  return new Set(
    (manifest.hooks[event] ?? [])
      .flatMap(({ matcher }) => matcher?.split("|") ?? [])
      .filter(Boolean),
  );
}

export function commandsFor(manifest: HookManifest, event?: string): HookCommand[] {
  const bindings = event ? (manifest.hooks[event] ?? []) : Object.values(manifest.hooks).flat();
  return bindings.flatMap(({ hooks }) => hooks ?? []);
}
