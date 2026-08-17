#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  eventCwd,
  eventSessionId,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";
import { extractFileTargets } from "@harness/core/hook-targets";

import { detectUiSource, findingKey, isIgnoredPath, isUiPath, type CraftFinding } from "../../lib/detect.ts";

const SESSION_CONTEXT = [
  "[Interface Craft] For interface, layout, typography, contrast, or UI anti-pattern work, invoke interface-craft and load interface-craft-floor before editing UI.",
  "This plugin does not write posters, decks, Remotion, or logos, and it does not replace web-frontend syntax or lockfile gates.",
].join("\n");

function warn(message: string): void {
  process.stderr.write(`[interface-craft] ${message}\n`);
}

function ledgerPath(sessionId: string): string {
  return join(tmpdir(), "interface-craft", `${sessionId || "unknown"}.json`);
}

function readLedger(sessionId: string): { files: string[]; keys: string[] } {
  try {
    const value: unknown = JSON.parse(readFileSync(ledgerPath(sessionId), "utf8"));
    if (!value || typeof value !== "object") return { files: [], keys: [] };
    const record = value as { files?: unknown; keys?: unknown };
    return {
      files: Array.isArray(record.files) ? record.files.filter((item): item is string => typeof item === "string") : [],
      keys: Array.isArray(record.keys) ? record.keys.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return { files: [], keys: [] };
  }
}

function writeLedger(sessionId: string, ledger: { files: string[]; keys: string[] }): void {
  const path = ledgerPath(sessionId);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger)}\n`);
}

function scanFile(filePath: string): CraftFinding[] {
  try {
    return detectUiSource(filePath, readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function formatFindings(findings: CraftFinding[]): string {
  return [
    "[Interface Craft] Mechanical findings on UI files:",
    ...findings.map((finding) => `- ${finding.code} ${finding.path}:${finding.line} ${finding.message}`),
  ].join("\n");
}

export function runSession(): void {
  writeJson(additionalContext("SessionStart", SESSION_CONTEXT));
}

export async function runPost(event?: HookEvent): Promise<void> {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; UI scan skipped");
  const sessionId = eventSessionId(current);
  const cwd = eventCwd(current);
  const targets = extractFileTargets(current, { tools: "mutation" })
    .map((target) => resolve(cwd, target))
    .filter((filePath) => isUiPath(filePath) && !isIgnoredPath(filePath));
  const ledger = readLedger(sessionId);
  const findings: CraftFinding[] = [];
  for (const filePath of targets) {
    if (!ledger.files.includes(filePath)) ledger.files.push(filePath);
    for (const finding of scanFile(filePath)) {
      const key = findingKey(finding);
      if (ledger.keys.includes(key)) continue;
      ledger.keys.push(key);
      findings.push(finding);
    }
  }
  writeLedger(sessionId, ledger);
  if (findings.length > 0) writeJson(additionalContext("PostToolUse", formatFindings(findings)));
}

export async function runStop(event?: HookEvent): Promise<void> {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; UI scan skipped");
  const sessionId = eventSessionId(current);
  const ledger = readLedger(sessionId);
  const findings: CraftFinding[] = [];
  for (const filePath of ledger.files) {
    for (const finding of scanFile(filePath)) {
      const key = findingKey(finding);
      if (ledger.keys.includes(key)) continue;
      ledger.keys.push(key);
      findings.push(finding);
    }
  }
  writeLedger(sessionId, ledger);
  if (findings.length > 0) writeJson(additionalContext("Stop", formatFindings(findings)));
}

const mode = process.argv[2] ?? "session";
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = mode === "post" ? runPost : mode === "stop" ? runStop : async () => runSession();
  run().catch((error: unknown) => {
    warn(error instanceof Error ? error.message : String(error));
    process.exit(0);
  });
}
