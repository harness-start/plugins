import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export type AioHost = "claude" | "codex";

export type AioRuntimeRoute = {
  module: string;
  script: string;
  args?: string[];
  matcher?: string;
  timeoutMs: number;
  trigger?: string;
};

export function readModuleRoutes(
  testUrl: string,
  host: AioHost,
  moduleName: string,
): Record<string, AioRuntimeRoute[]> {
  const ownerRoutes = JSON.parse(
    readFileSync(new URL(`../../../routes/${host}.json`, testUrl), "utf8"),
  ) as Record<string, AioRuntimeRoute[]>;
  return Object.fromEntries(
    Object.entries(ownerRoutes)
      .map(([event, routes]) => [event, routes.filter((route) => route.module === moduleName)] as const)
      .filter(([, routes]) => routes.length > 0),
  );
}

export function assertModuleRoutedOnBothHosts(testUrl: string, moduleName: string): void {
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(testUrl, host, moduleName);
    assert.ok(Object.keys(routes).length > 0, `${moduleName} has no ${host} owner route`);
  }
}
