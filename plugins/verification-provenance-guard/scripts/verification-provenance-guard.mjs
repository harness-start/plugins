#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectUnsupportedClaims } from "./lib/claims.mjs";
import {
  classifyCommand,
  commandHash,
  commandReliability,
  inferOutcome,
  parseCiResult,
  parseVerificationSummary,
} from "./lib/command-policy.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validateManifestEvidence } from "./lib/evidence.mjs";
import {
  extractEvidenceBlock,
  parseEvidenceManifest,
  removeEvidenceAndClaimLines,
  validateVisibleClaims,
} from "./lib/manifest.mjs";
import {
  additionalContextOutput,
  extractAssistantMessage,
  extractCwd,
  extractShellCommand,
  extractToolResponse,
  isFileMutation,
  isStopHookActive,
  readStdinJson,
  stopBlock,
  writeJson,
} from "./lib/hook-io.mjs";
import { clearState, readState, updateState } from "./lib/state-store.mjs";

const SESSION_CONTEXT = [
  "[Verification Provenance Guard] 交付证据协议已启用。",
  "发生文件/工作区变更，或最终回复声称测试、CI、Git、产物结论时，结尾必须包含 verification-evidence/v1 manifest。",
  "使用插件 Skill `verification-evidence-reporting` 获取完整模板。标签本身不是证据；verified 结论必须匹配本会话记录或当前文件/Git 状态。",
].join("\n");

function warn(message) {
  process.stderr.write(`[verification-provenance-guard] ${message}\n`);
}

function recordMutation(state) {
  state.revision += 1;
  state.mutations += 1;
}

function runPost(event, config, forceFailure) {
  updateState(event, (state) => {
    if (isFileMutation(event)) {
      recordMutation(state);
      return;
    }
    const command = extractShellCommand(event);
    if (!command?.trim()) return;
    const classification = classifyCommand(command, config.commands);
    const reliability = commandReliability(command);
    if (classification === "mutation" || reliability.workspaceMutation) recordMutation(state);
    if (!["test", "verification", "ci"].includes(classification)) return;
    const response = extractToolResponse(event);
    const outcome = inferOutcome(response, forceFailure);
    const provider = /\bgh\s+/iu.test(command) ? "github" : "gitlab";
    state.receipts.push({
      commandHash: commandHash(command),
      class: classification,
      outcome,
      reliable: reliability.reliable,
      revision: state.revision,
      summary: classification === "test" ? parseVerificationSummary(response) : null,
      ci: classification === "ci" && outcome === "success" ? parseCiResult(response, provider) : null,
      at: Date.now(),
    });
  });
}

function triggerRequired(config, state, unsupported, blockPresent) {
  if (config.trigger === "always") return true;
  if (blockPresent || unsupported.length > 0) return true;
  return config.trigger === "mutation-or-claim" && state.mutations > 0;
}

function formatBlock(findings) {
  return [
    "[Verification Provenance Guard] 完成态证据不完整或无法自动验证。",
    "",
    ...findings.slice(0, 12).map((finding) => `- ${finding}`),
    "",
    "恢复方式：使用 `verification-evidence-reporting` Skill，确保正文每条结论有 C#，并提供唯一的 verification-evidence/v1 JSON block。",
    "verified 结论必须引用最后一次变更后的命令 receipt、当前 workspace 产物/Git 状态，或本会话解析到的成功 CI receipt。",
    "无法自动证明时改为 [推断] 或 [未验证] 并填写 basis/reason；不要只补 [本地实测] 标签。",
  ].join("\n");
}

export async function evaluateStop(event, config, repoRoot) {
  const message = extractAssistantMessage(event);
  const state = readState(event);
  let block;
  const findings = [];
  try {
    block = extractEvidenceBlock(message, config.manifest);
  } catch (error) {
    findings.push(error.message);
    block = { present: true, raw: null, outside: message };
  }
  let unsupported = [];
  try {
    unsupported = detectUnsupportedClaims(
      block.present && block.raw !== null ? removeEvidenceAndClaimLines(message, config.manifest) : message,
      config.claims.additionalPatterns,
    );
  } catch (error) {
    findings.push(`claim detection failed: ${error.message}`);
  }
  if (!triggerRequired(config, state, unsupported, block.present)) return { allow: true, terminal: false, state };
  if (!block.present || block.raw === null) findings.push("missing a unique verification-evidence block");
  let manifest = null;
  if (block.raw !== null) {
    try {
      manifest = parseEvidenceManifest(block.raw, config.manifest);
      validateVisibleClaims(message, manifest, config.manifest);
    } catch (error) {
      findings.push(error.message);
    }
  }
  if (unsupported.length > 0) findings.push(`unsupported bare conclusion categories: ${unsupported.join(", ")}`);
  if (manifest) findings.push(...await validateManifestEvidence(manifest, { state, workspaceRoot: repoRoot, maxArtifactBytes: config.artifact.maxBytes }));
  if (findings.length > 0) return { allow: false, findings: [...new Set(findings)], state, manifest };
  return { allow: true, terminal: ["done", "done_with_concerns"].includes(manifest.completion), state, manifest };
}

async function runStop(event, config, repoRoot) {
  if (config.mode === "off") return;
  const decision = await evaluateStop(event, config, repoRoot);
  if (decision.allow) {
    if (decision.terminal) clearState(event);
    else updateState(event, (state) => { state.stopBlocks = 0; });
    return;
  }
  const active = isStopHookActive(event);
  const updated = updateState(event, (state) => { state.stopBlocks += 1; return state.stopBlocks; });
  const attempts = updated.result ?? decision.state.stopBlocks + 1;
  const reason = formatBlock(decision.findings);
  if (config.mode === "report" || (active && attempts > config.stop.maxBlocks)) {
    warn(`${reason}\n[fail-open] Stop retry limit reached; evidence state is retained.`);
    return;
  }
  writeJson(stopBlock(reason));
  process.stderr.write(`${reason}\n`);
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !["session", "post", "failure", "stop"].includes(mode)) return;
  const cwd = resolve(extractCwd(event));
  const { config, repoRoot } = await loadConfig(cwd, warn);
  if (mode === "session") {
    updateState(event, () => {});
    writeJson(additionalContextOutput(SESSION_CONTEXT));
  } else if (mode === "post") runPost(event, config, false);
  else if (mode === "failure") runPost(event, config, true);
  else await runStop(event, config, repoRoot);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
