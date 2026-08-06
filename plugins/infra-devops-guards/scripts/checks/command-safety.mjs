import { splitShellLogicalLines, tokenizeShell } from "../lib/shell-parse.mjs";

const DENY_RULES = [
  [/\bdocker(?:-compose|\s+compose)\s+down\b[^;|&]*(?:-v|--volumes)\b/iu, "Docker Compose volume deletion can destroy persistent data"],
  [/\bdocker\s+volume\s+(?:rm|remove|prune)\b/iu, "Docker volume deletion can destroy persistent data"],
  [/\baws\s+s3\s+rm\b[^;|&]*--recursive\b/iu, "Recursive S3 deletion can destroy persistent data"],
  [/\b(?:masscan|zmap)\b/iu, "Internet-scale scanners are not bounded diagnostics"],
  [/\bhping3\b[^;|&]*(?:--flood|--rand-source)/iu, "Packet flooding or random source probing is not bounded"],
  [/\bnmap\b[^;|&]*(?:\s\S+\/\d{1,2}(?:\s|$)|\s-iL\b|\s-p-(?:\s|$))/iu, "Nmap target or port range is unbounded"],
];

const REPORT_RULES = [
  [/\bkubectl\s+delete\s+(?:namespace|ns)\b/iu, "Deleting a namespace removes all resources inside it"],
  [/\bkubectl\s+delete\b[^;|&]*--all\b/iu, "kubectl delete --all is a bulk deletion"],
  [/\bkubectl\s+(?:drain|cordon)\b/iu, "Node drain/cordon can interrupt workloads"],
  [/\bkubectl\s+apply\s+-f\s+https?:\/\//iu, "Remote manifests cannot be reviewed before apply"],
  [/\bhelm\s+uninstall\b/iu, "Helm uninstall removes release resources"],
  [/\bdocker\s+system\s+prune\b[^;|&]*\s-a\b/iu, "docker system prune -a removes all unused images, containers, and networks"],
  [/\bdocker\s+(?:rm|remove)\s+-f\s+\$\(/iu, "docker rm -f with command substitution can remove containers in bulk"],
  [/\baws\s+s3\s+rb\b/iu, "aws s3 rb removes an S3 bucket"],
  [/\b(?:gcloud\s+projects|az\s+group)\s+delete\b/iu, "Cloud project/resource-group deletion has a broad blast radius"],
];

const SHELL_CARRIERS = new Set(["bash", "dash", "ksh", "sh", "ssh", "su", "zsh"]);
const WRAPPERS = new Set(["command", "env", "nohup", "sudo"]);

function executable(tokens) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index])) index += 1;
  while (index < tokens.length && WRAPPERS.has(tokens[index]?.split("/").at(-1))) {
    const wrapper = tokens[index]?.split("/").at(-1);
    index += 1;
    while (index < tokens.length && (tokens[index].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index]))) {
      const takesValue = wrapper === "sudo" && ["-C", "-D", "-g", "-h", "-p", "-R", "-T", "-u", "--chdir", "--group", "--host", "--prompt", "--user"].includes(tokens[index]);
      index += takesValue ? 2 : 1;
    }
  }
  return tokens[index]?.split("/").at(-1) ?? "";
}

function tokenCommands(command, depth = 0) {
  return splitShellLogicalLines(command).flatMap((line) => {
    const groups = [];
    let current = [];
    for (const token of tokenizeShell(line)) {
      if ([";", "&&", "||", "|"].includes(token)) {
        if (current.length) groups.push(current.join(" "));
        current = [];
      } else current.push(token);
    }
    if (current.length) groups.push(current);
    return groups.flatMap((tokens) => {
      const plain = tokens.filter((token) => !/\s/u.test(token));
      const texts = plain.length ? [plain.join(" ")] : [];
      if (depth < 3 && SHELL_CARRIERS.has(executable(plain))) {
        for (const token of tokens.filter((item) => /\s/u.test(item))) texts.push(...tokenCommands(token, depth + 1));
      }
      return texts;
    });
  });
}

function boundedCount(command, pattern, maximum) {
  const count = Number(command.match(pattern)?.[1]);
  return Number.isInteger(count) && count > 0 && count <= maximum;
}

function specialDecision(command) {
  if (/\bmtr\b/u.test(command) && (!/(?:^|\s)(?:--report|-r)(?:\s|$)/u.test(command) || !boundedCount(command, /(?:--report-cycles|-c)\s+(\d+)/u, 100))) return { action: "deny", reason: "mtr must use report mode with 1-100 cycles" };
  if (/\bping\b/u.test(command) && !boundedCount(command, /(?:^|\s)-c\s+(\d+)/u, 20)) return { action: "deny", reason: "ping must use -c with 1-20 packets" };
  if (/\btcpdump\b/u.test(command) && !boundedCount(command, /(?:^|\s)-c\s+(\d+)/u, 1000)) return { action: "deny", reason: "tcpdump must use -c with 1-1000 packets" };

  const iacMutation = /\b(?:terraform|tofu)\s+(?:apply|destroy)\b/iu.test(command);
  const planEvidence = /\b(?:terraform|tofu)\s+plan\b|(?:^|\s)(?:saved|tf|tofu)?plan(?:\.tfplan)?(?:\s|$)|\.(?:tfplan|plan)\b/iu.test(command);
  const iacApproval = /\bAI_EXPERTS_ALLOW_IAC_MUTATION=1\b|#\s*iac-mutation-ok\b/iu.test(command);
  if (iacMutation && !planEvidence && !iacApproval) return { action: "report", reason: "Terraform/OpenTofu mutation has no reviewable plan or saved-plan evidence" };

  const production = /(?:^|[\s=/"'-])(?:prod(?:uction)?|prd|live|主线)(?:[\s=/"'-]|$)/iu.test(command);
  if (production) {
    const productionRules = [
      [/\bkubectl\b[^;|&]*\bexec\b[^;|&]*\s-(?:it|ti)\b/iu, "kubectl exec -it enters a production container"],
      [/\bkubectl\b[^;|&]*\brollout\s+undo\b/iu, "kubectl rollout undo changes the production deployment version"],
      [/\bkubectl\b[^;|&]*\bscale\b[^;|&]*--replicas\s*=?\s*0\b/iu, "kubectl scale --replicas=0 stops all selected Pods"],
      [/\bkubectl\b[^;|&]*\bpatch\b[^;|&]*["']?replicas["']?\s*:\s*0\b/iu, "kubectl patch replicas:0 stops all selected Pods"],
      [/\bkubectl\b[^;|&]*\b(?:label|annotate)\b[^;|&]*--overwrite\b/iu, "kubectl metadata overwrite can change production selectors or policy"],
      [/\bkubectl\b[^;|&]*\bdelete\s+pod\b/iu, "deleting a production Pod can interrupt in-flight work"],
      [/\bkubectl\b[^;|&]*\breplace\s+--force\b/iu, "kubectl replace --force deletes before recreating the resource"],
      [/\bkubectl\b[^;|&]*\bedit\b/iu, "kubectl edit changes production state outside version control"],
      [/\bkubectl\b[^;|&]*\bset\s+image\b/iu, "kubectl set image changes the production image outside the delivery pipeline"],
    ];
    for (const [pattern, reason] of productionRules) if (pattern.test(command)) return { action: "report", reason };
  }

  const pve = tokenizeShell(command);
  const executable = pve.findIndex((token) => ["qm", "pct", "pvesm"].includes(token.split("/").at(-1)));
  if (executable >= 0) {
    const program = pve[executable].split("/").at(-1);
    const args = pve.slice(executable + 1);
    if (["qm", "pct"].includes(program) && args.includes("resize") && (args.includes("--shrink") || args.some((token) => /^-\d+(?:\.\d+)?(?:[KMGT]i?B?)?$/iu.test(token)))) return { action: "deny", reason: `${program} resize contains a disk shrink request` };
    if ((["qm", "pct"].includes(program) && (args[0] === "destroy" || args.includes("unlink") || args.includes("--delete"))) || (program === "pvesm" && args[0] === "free")) return { action: "report", reason: "PVE guest or volume operation can make persistent data unavailable" };
  }

  if (/\bkubectl\b[^;|&]*\bdelete\s+(?:statefulset|statefulsets|sts)\b/iu.test(command) && !/--cascade(?:=|\s+)orphan\b/iu.test(command)) return { action: "deny", reason: "StatefulSet deletion must use --cascade=orphan to retain Pods and PVCs" };
  if (/\bkubectl\b[^;|&]*\bdelete\s+(?:persistentvolumeclaims?|pvc|persistentvolumes?|pv)\b/iu.test(command)) return { action: "report", reason: "Persistent volume deletion can release or destroy data" };
  return null;
}

export function classifyInfrastructureCommand(command) {
  if (typeof command !== "string" || !command.trim()) return { action: "allow" };
  for (const segment of tokenCommands(command)) {
    for (const [pattern, reason] of DENY_RULES) if (pattern.test(segment)) return { action: "deny", reason };
    const special = specialDecision(segment);
    if (special) return special;
    for (const [pattern, reason] of REPORT_RULES) if (pattern.test(segment)) return { action: "report", reason };
  }
  return { action: "allow" };
}

export function infrastructureMessage(classification, command) {
  const title = classification.action === "deny" ? "[Dangerous Infra Command] 已拦截不可恢复或无界操作" : "[Infra Risk Notice] 检测到高风险基础设施操作";
  return [title, "", `原因：${classification.reason}`, `命令：${command}`, "", classification.action === "deny" ? "blockingContract:\n  observedFacts: 命令匹配不可恢复数据删除、存储缩容或无界探测\n  harm: 可能造成持久数据丢失、不可逆缩容或越权扫描\n  unblockWhen: 改为有界、可恢复且目标明确的操作\n  recovery: 记录备份、影响对象和回滚验证后重试" : "记录实际影响、授权范围与恢复条件后继续。"].join("\n");
}
