import { readFileSync } from "node:fs";
import { basename } from "node:path";

function read(path) { try { return readFileSync(path, "utf8").slice(0, 2 * 1024 * 1024); } catch { return null; } }
function conflictMarkers(path, text) { const hits = []; for (const [index, line] of text.split("\n").entries()) if (/^(?:<{7}|={7}|>{7})(?:\s|$)/u.test(line)) hits.push(`L${index + 1}: ${line.slice(0, 80)}`); return hits.length ? `[Merge Conflict] ${path}\n${hits.slice(0, 20).join("\n")}` : null; }

function workflowBlock(text) {
  const lines = text.split("\n"), start = lines.findIndex((line) => /^workflow:\s*(?:#.*)?$/u.test(line)); if (start < 0) return text; const result = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) { if (/^\S/u.test(lines[index]) && lines[index].trim()) break; result.push(lines[index]); }
  return result.join("\n");
}
function duplicatePipeline(path, text) {
  if (basename(path) !== ".gitlab-ci.yml" && basename(path) !== ".gitlab-ci.yaml") return null; const scope = workflowBlock(text);
  const mr = /merge_request_event/u.test(scope), branch = /CI_COMMIT_BRANCH|CI_PIPELINE_SOURCE\s*==\s*["']push["']/u.test(scope), dedup = /CI_OPEN_MERGE_REQUESTS/u.test(scope);
  return mr && branch && !dedup ? `[gitlab-ci-duplicate-pipeline] ${path}: workflow rules allow both branch/push and merge_request_event without CI_OPEN_MERGE_REQUESTS de-duplication` : null;
}
export function deliveryFileReports(path) { const text = read(path); if (text === null) return []; return [conflictMarkers(path, text), duplicatePipeline(path, text)].filter(Boolean); }
