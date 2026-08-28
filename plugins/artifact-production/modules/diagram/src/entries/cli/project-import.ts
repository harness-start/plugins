#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { computeDiagramSubjectDigest, loadDiagramProject, validateDiagramModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { importDiagramSource } from "../../lib/import.js";
import { assertDiagramProjectRoot, atomicWriteJson, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]); const rawInputPath = process.argv[3] ?? "";
  if (!isAbsolute(rawInputPath)) throw new Error("IMPORT_PATH_INVALID");
  const inputPath = resolve(rawInputPath);
  let model = await loadDiagramProject(root); const grant = await consumeWriterCapability({ root, capability: "diagram-import", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validateDiagramModel(model, { stage: "source" }); if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const result = importDiagramSource(relative(root, inputPath), await readFile(inputPath));
  await withWriterJournal(root, "diagram-import", async () => { await atomicWriteJson(root, "src/diagram.json", result.source); await atomicWriteJson(root, "plan.import-ledger.json", result.ledger); }, grant);
  model = await loadDiagramProject(root); process.stdout.write(`${JSON.stringify({ type: (result.source as { type?: unknown }).type, subjectDigest: computeDiagramSubjectDigest(model), losses: result.ledger.losses })}\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[diagram-project-import] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
