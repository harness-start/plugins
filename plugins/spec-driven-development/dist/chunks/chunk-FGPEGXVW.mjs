// harness-source-hash: sha256:87d4561f20ded1fbc93c96c9ede4e66465db7b42ea3c86885819b1c3b4610edc

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}

// plugins/spec-driven-development/src/lib/artifacts.ts
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
var MAX_ARTIFACT_BYTES = 256 * 1024;
var CHANGE_NAME = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var REQUIREMENT_ID = /^REQ-\d{3}$/u;
var TASK_ID = /^TASK-\d{3}$/u;
var REQUIRED_SPEC_SECTIONS = ["Intent", "Requirements", "Non-goals"];
var REQUIRED_PLAN_SECTIONS = ["Approach", "Change Surface", "Risks", "Validation"];
function finding(code, message, artifact = null) {
  return { code, message, artifact };
}
function isErrno(error) {
  return isRecord(error) && typeof error.code === "string";
}
function maskRange(text) {
  return text.replace(/[^\n]/gu, " ");
}
function maskFencedBlocks(text) {
  let fence = null;
  let visible = "";
  for (const line of text.match(/.*(?:\n|$)/gu) ?? []) {
    if (!line) continue;
    const body = line.endsWith("\n") ? line.slice(0, -1) : line;
    if (fence) {
      const close = body.match(/^ {0,3}(`+|~+)[ \t]*$/u)?.[1];
      visible += maskRange(line);
      if (close && close[0] === fence.character && close.length >= fence.length) fence = null;
      continue;
    }
    const open = body.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (open) {
      fence = { character: open[0] ?? "", length: open.length };
      visible += maskRange(line);
    } else visible += line;
  }
  return visible;
}
function maskCodeSpans(text) {
  let visible = "";
  let cursor = 0;
  const runs = [...text.matchAll(/`+/gu)];
  for (let index = 0; index < runs.length; index += 1) {
    const open = runs[index];
    if (!open || open.index === void 0) continue;
    let closeIndex = index + 1;
    while (closeIndex < runs.length && runs[closeIndex]?.[0].length !== open[0].length) closeIndex += 1;
    if (closeIndex >= runs.length) continue;
    const close = runs[closeIndex];
    if (!close || close.index === void 0) continue;
    visible += text.slice(cursor, open.index);
    visible += maskRange(text.slice(open.index, close.index + close[0].length));
    cursor = close.index + close[0].length;
    index = closeIndex;
  }
  return visible + text.slice(cursor);
}
function maskHtmlComments(text) {
  let visible = "";
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("<!--", cursor);
    if (start < 0) return visible + text.slice(cursor);
    visible += text.slice(cursor, start);
    const end = text.indexOf("-->", start + 4);
    if (end < 0) return visible + maskRange(text.slice(start));
    visible += maskRange(text.slice(start, end + 3));
    cursor = end + 3;
  }
  return visible;
}
function syntaxText(input) {
  return maskHtmlComments(maskCodeSpans(maskFencedBlocks(canonicalText(input))));
}
function hasRawHtmlBlock(text) {
  return /^ {0,3}(?:<\?|<!\[CDATA\[|<![A-Z]|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>))/mu.test(text);
}
function canonicalText(input) {
  const text = String(input ?? "").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  return `${text.replace(/\n+$/u, "")}
`;
}
function digestText(input) {
  return createHash("sha256").update(canonicalText(input), "utf8").digest("hex");
}
function sections(text, level = 2) {
  const hashes = "#".repeat(level);
  const expression = new RegExp(`^${hashes}\\s+(.+?)\\s*$`, "gmu");
  const matches = [...text.matchAll(expression)];
  const result = /* @__PURE__ */ new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    if (!current?.[1] || current.index === void 0) continue;
    const name = current[1].trim();
    const start = current.index + current[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const values = result.get(name.toLowerCase()) ?? [];
    values.push(text.slice(start, end).trim());
    result.set(name.toLowerCase(), values);
  }
  return result;
}
function requireUniqueSections(sectionMap, required, artifact, findings) {
  for (const name of required) {
    const values = sectionMap.get(name.toLowerCase()) ?? [];
    if (values.length === 0) findings.push(finding("missing-section", `${artifact} requires exactly one ## ${name} section.`, artifact));
    else if (values.length > 1) findings.push(finding("duplicate-section", `${artifact} contains duplicate ## ${name} sections.`, artifact));
    else if (!values[0]) findings.push(finding("empty-section", `${artifact} section ## ${name} must not be empty.`, artifact));
  }
}
function unresolved(text) {
  return /(?:\bTODO\b|\bTBD\b|NEEDS[ _-]?CLARIFICATION|\[\s*\?\s*\])/iu.test(text);
}
function validateSpecText(input) {
  const text = canonicalText(input);
  const syntax = syntaxText(text);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "spec.md does not allow raw HTML blocks.", "spec.md"));
  const sectionMap = sections(syntax);
  requireUniqueSections(sectionMap, REQUIRED_SPEC_SECTIONS, "spec.md", findings);
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "spec.md contains an unresolved marker.", "spec.md"));
  const requirementBody = (sectionMap.get("requirements") ?? [""])[0] ?? "";
  const headings = [...requirementBody.matchAll(/^###\s+(REQ-\d{3}):\s*(\S.*?)\s*$/gmu)];
  const requirements = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading?.[1] || heading[2] === void 0 || heading.index === void 0) continue;
    const id = heading[1];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? requirementBody.length;
    const body = requirementBody.slice(start, end);
    if (seen.has(id)) findings.push(finding("duplicate-requirement", `Duplicate requirement ${id}.`, "spec.md"));
    seen.add(id);
    const scenarios = [...body.matchAll(/^####\s+Scenario:\s*\S.*$/gmu)];
    if (scenarios.length === 0 || !/^-\s+Given\b\s*\S/imu.test(body) || !/^-\s+When\b\s*\S/imu.test(body) || !/^-\s+Then\b\s*\S/imu.test(body)) {
      findings.push(finding("invalid-scenario", `${id} requires a Scenario with non-empty Given, When, and Then bullets.`, "spec.md"));
    }
    requirements.push({ id, title: heading[2].trim() });
  }
  if (requirements.length === 0) findings.push(finding("missing-requirement", "spec.md requires at least one ### REQ-NNN requirement.", "spec.md"));
  return { kind: "spec", text, digest: digestText(text), requirements, findings };
}
function digestField(text, name) {
  const matches = [...text.matchAll(new RegExp(`^${name}:\\s*sha256:([0-9a-f]{64})\\s*$`, "gmu"))];
  return matches.length === 1 ? matches[0]?.[1] ?? null : null;
}
function validatePlanText(input, specResult) {
  const text = canonicalText(input);
  const syntax = syntaxText(text);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "plan.md does not allow raw HTML blocks.", "plan.md"));
  if (!specResult || specResult.findings.length > 0) findings.push(finding("invalid-upstream-spec", "plan.md requires a valid spec.md.", "plan.md"));
  const sectionMap = sections(syntax);
  requireUniqueSections(sectionMap, REQUIRED_PLAN_SECTIONS, "plan.md", findings);
  const specDigest = digestField(syntax, "Spec-Digest");
  if (!specDigest) findings.push(finding("missing-spec-digest", "plan.md requires one Spec-Digest: sha256:<digest> field.", "plan.md"));
  else if (specResult && specDigest !== specResult.digest) findings.push(finding("stale-spec-digest", "plan.md Spec-Digest does not match the current spec.md.", "plan.md"));
  for (const requirement of specResult?.requirements ?? []) {
    const count = [...syntax.matchAll(new RegExp(`\\b${requirement.id}\\b`, "gu"))].length;
    if (count === 0) findings.push(finding("uncovered-requirement", `plan.md does not cover ${requirement.id}.`, "plan.md"));
  }
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "plan.md contains an unresolved marker.", "plan.md"));
  return { kind: "plan", text, digest: digestText(text), specDigest, findings };
}
function splitValues(raw) {
  return String(raw ?? "").split(",").map((value) => value.trim().replace(/^`|`$/gu, "")).filter(Boolean);
}
function fieldOf(body, label) {
  const matches = [...body.matchAll(new RegExp(`^-\\s+${label}:\\s*(.*?)\\s*$`, "gimu"))];
  return { count: matches.length, value: matches[0]?.[1]?.trim() ?? "" };
}
function isSafeRepoPath(path, repoRoot = null) {
  if (!path || isAbsolute(path) || path.includes("\\") || /[\u0000-\u001f*?{}[\]]/u.test(path)) return false;
  const parts = path.split("/");
  if (!parts.every((part) => part && part !== "." && part !== "..")) return false;
  return !repoRoot || !hasSymlink(resolve(repoRoot, path), repoRoot);
}
function pathOverlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function reachable(tasks, start, target, visited = /* @__PURE__ */ new Set()) {
  if (start === target) return true;
  if (visited.has(start)) return false;
  visited.add(start);
  const task = tasks.get(start);
  return task ? task.depends.some((dependency) => reachable(tasks, dependency, target, visited)) : false;
}
function validateTasksText(input, specResult, planResult, repoRoot = null) {
  const text = canonicalText(input);
  const syntax = syntaxText(text);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "tasks.md does not allow raw HTML blocks.", "tasks.md"));
  if (!specResult || specResult.findings.length > 0) findings.push(finding("invalid-upstream-spec", "tasks.md requires a valid spec.md.", "tasks.md"));
  if (!planResult || planResult.findings.length > 0) findings.push(finding("invalid-upstream-plan", "tasks.md requires a valid current plan.md.", "tasks.md"));
  const specDigest = digestField(syntax, "Spec-Digest");
  const planDigest = digestField(syntax, "Plan-Digest");
  if (!specDigest) findings.push(finding("missing-spec-digest", "tasks.md requires one Spec-Digest field.", "tasks.md"));
  else if (specResult && specDigest !== specResult.digest) findings.push(finding("stale-spec-digest", "tasks.md Spec-Digest does not match spec.md.", "tasks.md"));
  if (!planDigest) findings.push(finding("missing-plan-digest", "tasks.md requires one Plan-Digest field.", "tasks.md"));
  else if (planResult && planDigest !== planResult.digest) findings.push(finding("stale-plan-digest", "tasks.md Plan-Digest does not match plan.md.", "tasks.md"));
  const headings = [...syntax.matchAll(/^##\s+(TASK-\d{3}):\s*(\S.*?)\s*$/gmu)];
  const tasks = /* @__PURE__ */ new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading?.[1] || heading.index === void 0) continue;
    const id = heading[1];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? syntax.length;
    const body = syntax.slice(start, end);
    if (tasks.has(id)) findings.push(finding("duplicate-task", `Duplicate task ${id}.`, "tasks.md"));
    const requirementField = fieldOf(body, "Requirement");
    const dependsField = fieldOf(body, "Depends");
    const filesField = fieldOf(body, "Files");
    const verifyField = fieldOf(body, "Verify");
    const fields = [
      ["Requirement", requirementField],
      ["Depends", dependsField],
      ["Files", filesField],
      ["Verify", verifyField]
    ];
    for (const [name, field] of fields) {
      if (field.count !== 1 || !field.value) findings.push(finding("invalid-task-field", `${id} requires exactly one non-empty ${name} field.`, "tasks.md"));
    }
    const requirements = splitValues(requirementField.value);
    const depends = /^none$/iu.test(dependsField.value) ? [] : splitValues(dependsField.value);
    const files = splitValues(filesField.value);
    for (const requirement of requirements) if (!REQUIREMENT_ID.test(requirement)) findings.push(finding("invalid-requirement-reference", `${id} references invalid requirement ${requirement}.`, "tasks.md"));
    for (const dependency of depends) if (!TASK_ID.test(dependency)) findings.push(finding("invalid-task-reference", `${id} references invalid dependency ${dependency}.`, "tasks.md"));
    for (const file of files) if (!isSafeRepoPath(file, repoRoot)) findings.push(finding("unsafe-task-file", `${id} contains unsafe file path ${file}.`, "tasks.md"));
    if (new Set(files).size !== files.length) findings.push(finding("duplicate-task-file", `${id} repeats a Files entry.`, "tasks.md"));
    if (!tasks.has(id)) tasks.set(id, { id, requirements, depends, files });
  }
  if (headings.length === 0) findings.push(finding("missing-task", "tasks.md requires at least one ## TASK-NNN task.", "tasks.md"));
  const requirementIds = new Set(specResult?.requirements.map(({ id }) => id) ?? []);
  for (const task of tasks.values()) {
    for (const requirement of task.requirements) if (!requirementIds.has(requirement)) findings.push(finding("unknown-requirement", `${task.id} references unknown ${requirement}.`, "tasks.md"));
    for (const dependency of task.depends) {
      if (dependency === task.id) findings.push(finding("self-dependency", `${task.id} depends on itself.`, "tasks.md"));
      else if (!tasks.has(dependency)) findings.push(finding("unknown-dependency", `${task.id} references unknown ${dependency}.`, "tasks.md"));
    }
  }
  for (const requirement of requirementIds) {
    if (![...tasks.values()].some((task) => task.requirements.includes(requirement))) findings.push(finding("uncovered-requirement", `tasks.md does not assign ${requirement}.`, "tasks.md"));
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  let hasCycle = false;
  const visit = (id) => {
    if (visiting.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id)?.depends ?? []) if (tasks.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of tasks.keys()) visit(id);
  if (hasCycle) findings.push(finding("dependency-cycle", "tasks.md dependency graph contains a cycle.", "tasks.md"));
  const taskList = [...tasks.values()];
  for (let leftIndex = 0; leftIndex < taskList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < taskList.length; rightIndex += 1) {
      const left = taskList[leftIndex];
      const right = taskList[rightIndex];
      if (!left || !right) continue;
      if (reachable(tasks, left.id, right.id) || reachable(tasks, right.id, left.id)) continue;
      for (const leftFile of left.files) for (const rightFile of right.files) {
        if (pathOverlaps(leftFile, rightFile)) findings.push(finding("parallel-file-overlap", `${left.id} and ${right.id} may run in parallel but overlap at ${leftFile} / ${rightFile}.`, "tasks.md"));
      }
    }
  }
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "tasks.md contains an unresolved marker.", "tasks.md"));
  return { kind: "tasks", text, digest: digestText(text), specDigest, planDigest, tasks: taskList, findings };
}
function decodeArtifact(path) {
  const bytes = readFileSync(path);
  if (bytes.length > MAX_ARTIFACT_BYTES) return { error: finding("artifact-too-large", `${basename(path)} exceeds 256 KiB.`, basename(path)) };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0") || /\r(?!\n)/u.test(text) || text.slice(1).includes("\uFEFF")) return { error: finding("invalid-text", `${basename(path)} contains NUL, bare CR, or embedded BOM.`, basename(path)) };
    return { text };
  } catch {
    return { error: finding("invalid-utf8", `${basename(path)} is not valid UTF-8.`, basename(path)) };
  }
}
function isWithin(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value === "" || !value.startsWith("..") && !isAbsolute(value);
}
function hasSymlink(path, stop) {
  let current = resolve(path);
  const boundary = resolve(stop);
  while (isWithin(boundary, current)) {
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch {
    }
    if (current === boundary) break;
    current = dirname(current);
  }
  return false;
}
function inspectChange(changeDir) {
  const absolute = resolve(changeDir);
  const findings = [];
  if (!CHANGE_NAME.test(basename(absolute))) findings.push(finding("invalid-change-name", "Change directory must match NNN-lowercase-slug.", basename(absolute)));
  if (basename(dirname(absolute)) !== ".specs") findings.push(finding("invalid-spec-root", "Change directory must be directly under .specs/.", basename(absolute)));
  if (hasSymlink(absolute, dirname(absolute))) findings.push(finding("symlink-artifact", "Change directory or artifact path contains a symlink.", basename(absolute)));
  const values = {};
  for (const name of ["spec.md", "plan.md", "tasks.md"]) {
    const path = resolve(absolute, name);
    try {
      if (lstatSync(path).isSymbolicLink()) {
        findings.push(finding("symlink-artifact", `${name} must not be a symlink.`, name));
        continue;
      }
      const decoded = decodeArtifact(path);
      if ("error" in decoded) findings.push(decoded.error);
      else values[name] = decoded.text;
    } catch (error) {
      if (!isErrno(error) || error.code !== "ENOENT") findings.push(finding("artifact-read-error", `Cannot read ${name}.`, name));
    }
  }
  const spec = values["spec.md"] === void 0 ? null : validateSpecText(values["spec.md"]);
  const plan = values["plan.md"] === void 0 ? null : validatePlanText(values["plan.md"], spec);
  const tasks = values["tasks.md"] === void 0 ? null : validateTasksText(values["tasks.md"], spec, plan, dirname(dirname(absolute)));
  for (const result of [spec, plan, tasks]) if (result) findings.push(...result.findings);
  return { changeDir: absolute, spec, plan, tasks, findings };
}
function formatFindings(findings) {
  return findings.map(({ code, message }) => `${code}: ${message}`).join(" ");
}

export {
  isRecord,
  eventCwd,
  eventToolName,
  eventToolInput,
  digestText,
  inspectChange,
  formatFindings
};
