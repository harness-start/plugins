#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { applicationMarker, validateApplication } from "./lib/workflow-policy.mjs";
import {
  readMailboxRun,
  writeMailboxApplication,
  writeMailboxClose,
  writeMailboxRun,
} from "./lib/workflow-mailbox.mjs";
import { closeRun, stageApplication } from "./lib/workflow-run.mjs";
import { readState, updateState, writeApplicationArtifact } from "./lib/workflow-state.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

function contextFrom(options) {
  const requestedHost = String(options.host ?? "").trim();
  const persistedHost = String(process.env.SUBAGENT_WORKFLOW_GUARD_HOST ?? "").trim();
  if (requestedHost && persistedHost && requestedHost !== persistedHost) {
    throw new Error(`--host ${requestedHost} conflicts with persisted platform host ${persistedHost}`);
  }
  const inferredHost = process.env.CODEX_THREAD_ID ? "codex" : (process.env.CLAUDE_SESSION_ID ? "claude" : "");
  const host = requestedHost || persistedHost || inferredHost;
  if (!new Set(["claude", "codex"]).has(host)) throw new Error("--host must be claude or codex");
  const platformSession = host === "codex" ? process.env.CODEX_THREAD_ID : process.env.CLAUDE_SESSION_ID;
  const explicitSession = String(options.session ?? "").trim();
  const sessionId = String(explicitSession || process.env.AI_EXPERTS_SESSION_ID || platformSession || "").trim();
  const cwd = resolve(String(options.cwd ?? process.cwd()));
  const direct = Boolean(explicitSession && explicitSession !== "hook");
  if (!sessionId || sessionId === "hook") throw new Error("--session or a platform session environment variable is required");
  return { host, sessionId, cwd, direct };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function runOpen(context, options) {
  const runId = String(options["run-id"] ?? "").trim();
  if (!/^[a-zA-Z0-9._-]{1,96}$/u.test(runId)) throw new Error("--run-id is required and must be path-safe");
  if (!context.direct) {
    const current = await readMailboxRun(context);
    if (current && current.phase !== "closed") throw new Error(`run ${current.runId} is already requested`);
    await writeMailboxRun(context, { version: 1, sessionId: context.sessionId, runId, phase: "requested", requestedAt: Date.now() });
    output({ ok: true, runId, phase: "requested" });
    return;
  }
  await updateState(context, (state) => {
    if (state.run?.phase === "open") throw new Error(`run ${state.run.id} is already open`);
    state.run = { id: runId, phase: "open", openedAt: Date.now(), closedAt: null, completion: null };
    state.applications = {};
    state.bindings = {};
  });
  output({ ok: true, runId, phase: "open" });
}

async function prepare(context, options) {
  if (!options.file) throw new Error("--file is required");
  const source = resolve(context.cwd, String(options.file));
  const raw = JSON.parse(await readFile(source, "utf8"));
  if (!context.direct) {
    const request = await readMailboxRun(context);
    if (!request || request.sessionId !== context.sessionId || !["requested", "open"].includes(request.phase)) throw new Error("no governed run is requested for this session");
    const application = validateApplication(raw, request.runId);
    await writeMailboxApplication(context, application);
    output({ ok: true, applicationId: application.id, nonce: application.nonce, marker: applicationMarker(application), phase: "requested" });
    return;
  }
  let stored;
  await updateState(context, (state) => {
    stored = stageApplication(state, raw);
  });
  const artifactPath = await writeApplicationArtifact(context, stored);
  await updateState(context, (state) => {
    state.applications[stored.id].artifactPath = artifactPath;
  });
  output({ ok: true, applicationId: stored.id, nonce: stored.nonce, marker: applicationMarker(stored), path: artifactPath });
}

async function runClose(context, options) {
  const completion = String(options.status ?? "DONE").toUpperCase();
  if (!context.direct) {
    const request = await readMailboxRun(context);
    if (!request || request.sessionId !== context.sessionId || !["requested", "open"].includes(request.phase)) throw new Error("no governed run is requested for this session");
    if (!["DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED"].includes(completion)) {
      throw new Error("--status must be DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED");
    }
    await writeMailboxClose(context, { version: 1, sessionId: context.sessionId, runId: request.runId, completion, requestedAt: Date.now() });
    output({ ok: true, runId: request.runId, phase: "close-requested", completion });
    return;
  }
  let runId;
  await updateState(context, (state) => {
    runId = closeRun(state, completion);
  });
  output({ ok: true, runId, phase: "closed", completion });
}

async function inspect(context) {
  output(context.direct ? await readState(context) : await readMailboxRun(context));
}

async function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));
  const context = contextFrom(options);
  if (command === "run-open") await runOpen(context, options);
  else if (command === "prepare") await prepare(context, options);
  else if (command === "run-close") await runClose(context, options);
  else if (command === "inspect") await inspect(context);
  else throw new Error(`unknown command: ${command ?? "missing"}`);
}

main().catch((error) => {
  process.stderr.write(`[subagent-workflow-guard] ${error?.message ?? error}\n`);
  process.exitCode = 2;
});
