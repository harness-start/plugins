#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  blockProposal,
  deferProposal,
  deleteProposal,
  reopenProposal,
  startProposal,
} from "../../lib/lifecycle.js";

function parseArgs(argv: string[]): { action: string | undefined; options: Record<string, string> } {
  const [action, ...rest] = argv;
  const options: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--") || index + 1 >= rest.length) throw new Error(`invalid argument: ${key}`);
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`invalid argument: ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return { action, options };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const { action, options } = parseArgs(argv);
  const root = resolve(options.root ?? process.cwd());
  let result;
  if (action === "start") result = await startProposal(root, options.proposal ?? "");
  else if (action === "block") result = await blockProposal(root, options.proposal ?? "", options.reason);
  else if (action === "defer") result = await deferProposal(root, options.proposal ?? "", options.condition);
  else if (action === "reopen") result = await reopenProposal(root, options.proposal ?? "");
  else if (action === "delete") result = await deleteProposal(root, options.proposal ?? "", options.outcome ?? "");
  else throw new Error("action must be start, block, defer, reopen, or delete");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[project-capability-manage] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}

export { main, parseArgs };
export { validateProposalDocument } from "../../lib/proposals.js";
