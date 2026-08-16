import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createLedger,
  renderWorkReport,
  validateWorkReportContract,
  type WorkReportContractV2,
  type WorkReportLedgerV2,
} from "./report-contract.js";
import type { ReportArgs } from "./report-cli.js";
import { SEAL_PREFIX } from "./report-integrity.js";
import type { EvidenceBundleV2 } from "./work-evidence.js";

export type ReportCandidate = {
  body: string;
  schema: "legacy-markdown" | "WorkReportContractV2";
  candidatePath: string;
  evidencePath: string | null;
  contract: WorkReportContractV2 | null;
  evidence: EvidenceBundleV2 | null;
  ledger: WorkReportLedgerV2 | null;
};

async function readJson(path: string, label: string): Promise<unknown> {
  try { return JSON.parse(await readFile(resolve(path), "utf8")); }
  catch (error) { throw new Error(`${label} is not valid readable JSON: ${String(error)}`); }
}

export async function readReportCandidate(args: Pick<ReportArgs, "input" | "contract" | "evidence">, cwd = process.cwd()): Promise<ReportCandidate> {
  if (args.contract) {
    if (!args.evidence) throw new Error("--evidence is required with --contract");
    const contractPath = resolve(cwd, args.contract);
    const evidencePath = resolve(cwd, args.evidence);
    const contract = await readJson(contractPath, "contract") as WorkReportContractV2;
    const evidence = await readJson(evidencePath, "evidence") as EvidenceBundleV2;
    const checked = validateWorkReportContract(contract, evidence);
    if (!checked.ok) throw new Error(`invalid WorkReportContractV2: ${checked.errors.join("; ")}`);
    const body = renderWorkReport(contract, evidence);
    return { body, schema: "WorkReportContractV2", candidatePath: contractPath, evidencePath, contract, evidence, ledger: createLedger(contract, evidence, body) };
  }
  if (!args.input) throw new Error("--input or --contract is required");
  const candidatePath = resolve(cwd, args.input);
  let body = await readFile(candidatePath, "utf8");
  if (!body.trim()) throw new Error("candidate content is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("candidate content contains a reserved seal marker");
  if (!body.endsWith("\n")) body += "\n";
  return { body, schema: "legacy-markdown", candidatePath, evidencePath: null, contract: null, evidence: null, ledger: null };
}
