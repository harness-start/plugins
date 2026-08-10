#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyJournal } from "./lib/journal.mjs";

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function fail(message) {
  process.stderr.write(`[compact-context-journal-query] ${message}\n`);
  process.exitCode = 2;
}

function admittedPromptId(event) {
  return event.body.match(/(?:^|\n)Admitted prompt:\s*(P\d{6})(?:\n|$)/u)?.[1] ?? null;
}

function printIndex(verified) {
  const boundary = [...verified.events].reverse().find((event) => event.id.startsWith("B"));
  const active = verified.events.filter((event) => event.seq > (boundary?.seq ?? 0));
  const prompts = new Map(active.filter((event) => event.id.startsWith("P")).map((event) => [event.id, event]));
  const admissions = active.filter((event) => event.id.startsWith("U")).slice(-20);
  const lines = [
    "Integrity: verified",
    `Active boundary: ${boundary?.id ?? "none"}`,
    `Admitted entries: ${admissions.length}${active.filter((event) => event.id.startsWith("U")).length > 20 ? " (latest 20)" : ""}`,
  ];
  for (const admission of admissions) {
    const promptId = admittedPromptId(admission);
    const prompt = promptId ? prompts.get(promptId) : null;
    lines.push(`${admission.id} -> ${promptId ?? "unresolved"}${prompt ? ` (prompt lines ${prompt.bodyStartLine}-${prompt.bodyEndLine})` : ""}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function printEvent(verified, id, journalPath) {
  const event = verified.events.find((candidate) => candidate.id === id);
  if (!event) return fail(`event not found: ${id}`);
  const bytes = Buffer.byteLength(event.body, "utf8");
  if (bytes > 32 * 1024) {
    process.stdout.write([
      `Integrity: verified; event ${id} is ${bytes} bytes and exceeds the 32768-byte query limit.`,
      `Read explicitly if needed: sed -n '${event.bodyStartLine},${event.bodyEndLine}p' -- '${journalPath.replaceAll("'", `'"'"'`)}'`,
      "",
    ].join("\n"));
    return;
  }
  process.stdout.write(`Integrity: verified\n${event.body}`);
}

export function main(args = process.argv.slice(2)) {
  const command = args[0];
  const journalPath = option(args, "--journal");
  const sessionId = option(args, "--session-id");
  if (!journalPath || sessionId === null) return fail("--journal and --session-id are required");
  const verified = verifyJournal(resolve(journalPath), { expectedSessionId: sessionId });
  if (!verified.ok || verified.partialTailBytes > 0) return fail(`integrity verification failed: ${verified.reason ?? "partial tail"}`);
  if (command === "index") return printIndex(verified);
  if (command === "event" && args[1]) return printEvent(verified, args[1], resolve(journalPath));
  return fail("usage: index|event <ID> --journal <path> --session-id <raw-id>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
