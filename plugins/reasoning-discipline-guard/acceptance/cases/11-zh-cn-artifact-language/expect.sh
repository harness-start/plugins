#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: missing workflow" >&2; exit 1; }
dir="$(dirname "${workflow}")"

node - "${dir}" <<'NODE'
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const directory = process.argv[2];
const names = [
  "workflow.md",
  "01-frame.md",
];
if (existsSync(join(directory, "02-analysis.md"))) names.push("02-analysis.md");
const proseKeys = new Set([
  "question", "successCriteria", "nextAction", "statement", "falsifier",
  "impact", "resolution", "dimension", "timing", "basis", "alternative",
  "implication", "constraints", "result", "claim", "candidateAnswer",
  "candidateCause", "candidateDecision", "test", "evidence",
  "independenceNote", "assessment", "conclusion", "conditions",
  "residualUncertainties",
]);
const templatePhrases = [
  "precise question", "observable condition", "falsifiable assumption",
  "observation that rejects it", "material ambiguity", "desired outcome",
  "hard boundary", "option one", "evaluation criterion",
  "evidence-based assessment", "decision claim", "concrete result",
  "check result", "calibrated answer",
];

function parseMachineBlock(name) {
  const markdown = readFileSync(join(directory, name), "utf8");
  const match = markdown.match(/```json\s+[^\n]+\n([\s\S]*?)\n```/u);
  if (!match) throw new Error(`${name} has no machine block`);
  return JSON.parse(match[1]);
}

function collect(value, key = "", output = []) {
  if (typeof value === "string") {
    if (proseKeys.has(key)) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      collect(childValue, childKey, output);
    }
  }
  return output;
}

const artifacts = names.map(parseMachineBlock);
if (artifacts[0].status !== "paused") throw new Error("workflow is not paused");
if (artifacts[0].branch !== "causal") throw new Error("workflow is not causal branch");
if (artifacts[0].completionReceipt !== null) throw new Error("paused workflow claims completion");
if (!["analysis", "challenge"].includes(artifacts[0].resume?.nextStage)) {
  throw new Error(`unexpected resume stage: ${artifacts[0].resume?.nextStage}`);
}
const prose = artifacts.flatMap((artifact) => collect(artifact));
if (prose.length < 6) throw new Error(`too few prose values: ${prose.length}`);

for (const value of prose) {
  if (!/\p{Script=Han}/u.test(value)) {
    throw new Error(`prose value does not follow zh-CN: ${JSON.stringify(value)}`);
  }
  const lower = value.toLowerCase();
  const copied = templatePhrases.find((phrase) => lower.includes(phrase));
  if (copied) throw new Error(`copied English template phrase ${copied}: ${value}`);
  if (/(?:[A-Za-z][A-Za-z-]*\s+){5,}[A-Za-z][A-Za-z-]*/u.test(value)) {
    throw new Error(`excessive English prose: ${JSON.stringify(value)}`);
  }
}
NODE

echo "OK paused zh-CN reasoning artifacts localized prose without translating machine tokens"
