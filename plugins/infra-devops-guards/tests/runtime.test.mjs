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

test("iac-debt-guard reports Terraform/OpenTofu mutations without plan evidence", () => {
  assert.equal(classifyInfrastructureCommand("terraform apply").action, "report");
  assert.equal(classifyInfrastructureCommand("tofu destroy").action, "report");
  assert.equal(classifyInfrastructureCommand("terraform apply saved.tfplan").action, "allow");
  assert.equal(classifyInfrastructureCommand("AI_EXPERTS_ALLOW_IAC_MUTATION=1 tofu destroy").action, "allow");
});

test("devops-production-kubectl-guard preserves production-only reports", () => {
  assert.equal(classifyInfrastructureCommand("kubectl -n prod scale deployment/api --replicas=0").action, "report");
  assert.equal(classifyInfrastructureCommand("kubectl -n staging scale deployment/api --replicas=0").action, "allow");
  assert.equal(classifyInfrastructureCommand("kubectl --context production set image deploy/api api=v2").action, "report");
  assert.equal(classifyInfrastructureCommand("kubectl -n live exec pod/api -it -- sh").action, "report");
});

test("devops-dangerous-infra-guard ignores quoted prose and expands shell carriers", () => {
  assert.equal(classifyInfrastructureCommand('git commit -m "document docker volume rm prod-data"').action, "allow");
  assert.equal(classifyInfrastructureCommand("sh -c 'docker volume rm prod-data'").action, "deny");
  assert.equal(classifyInfrastructureCommand("docker system prune -a").action, "report");
  assert.equal(classifyInfrastructureCommand("aws s3 rb s3://archive").action, "report");
});

test("network, PVE, and Kubernetes storage guards preserve bounded recovery semantics", () => {
  assert.equal(classifyInfrastructureCommand("mtr --report --report-cycles 20 example.com").action, "allow");
  assert.equal(classifyInfrastructureCommand("tcpdump -i any").action, "deny");
  assert.equal(classifyInfrastructureCommand("qm resize 100 scsi0 -5G").action, "deny");
  assert.equal(classifyInfrastructureCommand("pvesm free local:vm-100-disk-0").action, "report");
  assert.equal(classifyInfrastructureCommand("kubectl delete sts db").action, "deny");
  assert.equal(classifyInfrastructureCommand("kubectl delete sts db --cascade=orphan").action, "allow");
  assert.equal(classifyInfrastructureCommand("kubectl delete pvc data-db-0").action, "report");
});

test("infrastructure-encoding-guard and iac-debt file reports stay advisory", () => {
  const directory = mkdtempSync(join(tmpdir(), "infra-guards-"));
  try {
    const yaml = join(directory, "deployment.yaml");
    const terraform = join(directory, "main.tf");
    writeFileSync(yaml, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("apiVersion: v1\nkind: ConfigMap\n")]));
    writeFileSync(terraform, 'resource "x" "y" { privileged = true } # TODO\n');
    assert.match(infrastructureFileReports(yaml).join("\n"), /Infrastructure Encoding Guard/u);
    assert.match(infrastructureFileReports(terraform).join("\n"), /IaC Debt Guard/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
