import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyInfrastructureCommand } from "../scripts/checks/command-safety.mjs";
import { infrastructureFileReports } from "../scripts/checks/file-checks.mjs";

const pre = fileURLToPath(new URL("../scripts/infra-hook-pre-tool.mjs", import.meta.url));
function run(payload) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [pre], { stdio: ["pipe", "pipe", "pipe"] }); const out=[]; const err=[]; child.stdout.on("data", c=>out.push(c)); child.stderr.on("data", c=>err.push(c)); child.once("error", reject); child.once("close", code=>resolve({code,stdout:Buffer.concat(out).toString("utf8").trim(),stderr:Buffer.concat(err).toString("utf8")})); child.stdin.end(JSON.stringify(payload)); }); }

test("classifies irreversible data deletion and bounded network probes", () => {
  assert.equal(classifyInfrastructureCommand("docker volume rm prod-data").action, "deny");
  assert.equal(classifyInfrastructureCommand("ping -c 5 127.0.0.1").action, "allow");
  assert.equal(classifyInfrastructureCommand("ping 127.0.0.1").action, "deny");
  assert.equal(classifyInfrastructureCommand("kubectl drain node-a").action, "report");
});
test("entry denies Docker volume deletion with blocking contract", async () => { const result = await run({tool_name:"bash",tool_input:{command:"docker volume rm prod-data"}}); assert.equal(result.code,0,result.stderr); const output=JSON.parse(result.stdout); assert.equal(output.hookSpecificOutput.permissionDecision,"deny"); assert.match(output.hookSpecificOutput.permissionDecisionReason,/blockingContract/u); });
test("entry denies direct Terraform lockfile writes", async () => { const result = await run({tool_name:"apply_patch",tool_input:{patch:"*** Begin Patch\n*** Update File: .terraform.lock.hcl\n+x\n*** End Patch"}}); assert.equal(result.code,0,result.stderr); assert.match(result.stdout,/Infrastructure Dependency Lockfile Guard/u); });
test("safe command exits without output", async () => { const result = await run({tool_name:"Bash",tool_input:{command:"kubectl get pods"}}); assert.equal(result.code,0,result.stderr); assert.equal(result.stdout,""); });
test("file checks retain useful fallbacks without bundled linters", () => {
  const directory = mkdtempSync(join(tmpdir(), "infra-guards-"));
  try {
    const shell = join(directory, "unsafe.sh");
    const dockerfile = join(directory, "Dockerfile");
    writeFileSync(shell, "#!/usr/bin/env bash\necho ok\n");
    writeFileSync(dockerfile, "FROM alpine:latest\n");
    assert.match(infrastructureFileReports(shell).join("\n"), /Defensive Bash/u);
    assert.match(infrastructureFileReports(dockerfile).join("\n"), /latest|DL3007/iu);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
