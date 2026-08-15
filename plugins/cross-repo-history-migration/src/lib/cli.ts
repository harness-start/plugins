function requireProvenance() {
  const sessionId = process.env.AI_EXPERTS_SESSION_ID?.trim();
  const triggerFrom = process.env.AI_EXPERTS_TRIGGER_FROM?.trim();
  if (!sessionId || !triggerFrom) {
    throw new Error("AI_EXPERTS_SESSION_ID and AI_EXPERTS_TRIGGER_FROM are required");
  }
  return { sessionId, triggerFrom };
}

export function parseArguments(argv, { execute = false } = {}) {
  const result = { includePaths: [] };
  const scalar = new Map([
    ["--source", "source"],
    ["--target", "target"],
    ["--ref", "ref"],
    ["--target-branch", "targetBranch"],
    ["--git-filter-repo", "gitFilterRepo"],
    ["--expected-source-head", "expectedSourceHead"],
    ["--expected-plan-digest", "expectedPlanDigest"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--include") {
      if (!value) throw new Error("--include requires a value");
      result.includePaths.push(value);
      index += 1;
    } else if (scalar.has(flag)) {
      if (!value) throw new Error(`${flag} requires a value`);
      result[scalar.get(flag)] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }

  for (const field of ["source", "target"]) {
    if (!result[field]) throw new Error(`--${field} is required`);
  }
  if (result.includePaths.length === 0) throw new Error("at least one --include is required");
  if (execute) {
    if (!result.expectedSourceHead) throw new Error("--expected-source-head is required");
    if (!result.expectedPlanDigest) throw new Error("--expected-plan-digest is required");
  }
  return result;
}

export function runCli(toolId, operation, argv) {
  try {
    const provenance = requireProvenance();
    const data = operation(parseArguments(argv, { execute: toolId.endsWith("execute") }));
    process.stdout.write(`${JSON.stringify({
      ok: true,
      toolId,
      ...provenance,
      observedAt: new Date().toISOString(),
      data,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      toolId,
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? null,
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? null,
      observedAt: new Date().toISOString(),
      error: error.message,
    })}\n`);
    process.exitCode = 1;
  }
}
