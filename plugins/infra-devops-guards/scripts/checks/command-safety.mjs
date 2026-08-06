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
  [/\b(?:gcloud\s+projects|az\s+group)\s+delete\b/iu, "Cloud project/resource-group deletion has a broad blast radius"],
];

function tokenCommands(command) {
  return splitShellLogicalLines(command).flatMap((line) => {
    const groups = [];
    let current = [];
    for (const token of tokenizeShell(line)) {
      if ([";", "&&", "||", "|"].includes(token)) {
        if (current.length) groups.push(current.join(" "));
        current = [];
      } else current.push(token);
    }
    if (current.length) groups.push(current.join(" "));
    return groups;
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
