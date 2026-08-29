import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AioHost = "claude" | "codex";

export type AioRuntimeRoute = {
  module?: string;
  script?: string;
  handler?: string;
  args?: string[];
  matcher?: string;
  timeoutMs: number;
  trigger?: string;
};

function ownerRoot(testUrl: string, host: AioHost): string {
  let cursor = dirname(fileURLToPath(testUrl));
  while (true) {
    if (existsSync(resolve(cursor, "routes", `${host}.json`))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`cannot locate owner routes from ${testUrl}`);
    cursor = parent;
  }
}

function readOwnerRoutes(testUrl: string, host: AioHost): Record<string, AioRuntimeRoute[]> {
  return JSON.parse(
    readFileSync(resolve(ownerRoot(testUrl, host), "routes", `${host}.json`), "utf8"),
  ) as Record<string, AioRuntimeRoute[]>;
}

export function readModuleRoutes(
  testUrl: string,
  host: AioHost,
  moduleName: string,
): Record<string, AioRuntimeRoute[]> {
  const ownerRoutes = readOwnerRoutes(testUrl, host);
  return Object.fromEntries(
    Object.entries(ownerRoutes)
      .map(([event, routes]) => [event, routes.filter((route) => route.module === moduleName)] as const)
      .filter(([, routes]) => routes.length > 0),
  );
}

export function readHandlerRoutes(
  testUrl: string,
  host: AioHost,
  handlerName: string,
): Record<string, AioRuntimeRoute[]> {
  return Object.fromEntries(
    Object.entries(readOwnerRoutes(testUrl, host))
      .map(([event, routes]) => [event, routes.filter((route) => route.handler === handlerName)] as const)
      .filter(([, routes]) => routes.length > 0),
  );
}

export function assertHandlerRoutedOnBothHosts(testUrl: string, handlerName: string): void {
  for (const host of ["claude", "codex"] as const) {
    const routes = readHandlerRoutes(testUrl, host, handlerName);
    assert.ok(Object.keys(routes).length > 0, `${handlerName} has no ${host} owner route`);
  }
}

export function assertModuleRoutedOnBothHosts(testUrl: string, moduleName: string): void {
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(testUrl, host, moduleName);
    assert.ok(Object.keys(routes).length > 0, `${moduleName} has no ${host} owner route`);
  }
}
