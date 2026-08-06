import { basename } from "node:path";
import { extractWriteTargets } from "../lib/hook-io.mjs";

export function lockfileTargets(toolName, toolInput) {
  return extractWriteTargets(toolName, toolInput).filter((target) => basename(target.replaceAll("\\", "/")) === ".terraform.lock.hcl");
}

export function lockfileMessage(targets) {
  return ["[Infrastructure Dependency Lockfile Guard] 已拦截 provider lock 文件修改", "", `目标：${targets.join(", ")}`, ".terraform.lock.hcl 由 Terraform/OpenTofu 生成，不得直接编辑。", "blockingContract:", "  observedFacts: 写入目标包含 .terraform.lock.hcl", "  harm: 手工修改会破坏 provider 校验和与可复现性", "  unblockWhen: 用户授权依赖更新并由 Terraform/OpenTofu 重新生成", "  recovery: 恢复 lock 文件后运行受控的 init -upgrade 流程"].join("\n");
}
