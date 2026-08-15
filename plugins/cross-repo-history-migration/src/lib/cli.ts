function requireProvenance(): { sessionId: string; triggerFrom: string } {
  const sessionId = process.env.AI_EXPERTS_SESSION_ID?.trim();
  const triggerFrom = process.env.AI_EXPERTS_TRIGGER_FROM?.trim();
  if (!sessionId || !triggerFrom) {
    throw new Error("AI_EXPERTS_SESSION_ID and AI_EXPERTS_TRIGGER_FROM are required");
  }
  return { sessionId, triggerFrom };
}

export type MigrationCliArgs = {
  includePaths: string[];
  source?: string;
  target?: string;
  ref?: string;
  targetBranch?: string;
  gitFilterRepo?: string;
  expectedSourceHead?: string;
  expectedPlanDigest?: string;
};

type ScalarField = Exclude<keyof MigrationCliArgs, "includePaths">;

export type ParsedMigrationArgs = MigrationCliArgs & {
  source: string;
  target: string;
};

export function parseArguments(argv: readonly string[], { execute = false } = {}): ParsedMigrationArgs {
  const result: MigrationCliArgs = { includePaths: [] };
  const scalar = new Map<string, ScalarField>([
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
    } else if (flag !== undefined && scalar.has(flag)) {
      if (!value) throw new Error(`${flag} requires a value`);
      const field = scalar.get(flag);
      if (field) result[field] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }

  const source = result.source;
  const target = result.target;
  if (!source) throw new Error("--source is required");
  if (!target) throw new Error("--target is required");
  if (result.includePaths.length === 0) throw new Error("at least one --include is required");
  if (execute) {
    if (!result.expectedSourceHead) throw new Error("--expected-source-head is required");
    if (!result.expectedPlanDigest) throw new Error("--expected-plan-digest is required");
  }
  return { ...result, source, target };
}

export function runCli(
  toolId: string,
  operation: (args: ParsedMigrationArgs) => unknown,
  argv: readonly string[],
): void {
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
  } catch (error: unknown) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      toolId,
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? null,
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? null,
      observedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
