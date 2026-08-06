export async function readStdinJson() { let raw = ""; for await (const chunk of process.stdin) raw += chunk; if (!raw.trim()) return {}; try { return JSON.parse(raw); } catch { return { __parseError: true }; } }
export function toolName(event) { return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? ""; }
export function toolInput(event) { return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {}; }
export function cwd(event) { return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd(); }
export function sessionId(event) { return event?.session_id ?? event?.sessionId ?? event?.sessionID ?? event?.context?.session_id ?? null; }
export function shellCommand(event) { const input = toolInput(event), name = String(toolName(event)); if (!/bash|shell|exec|command/iu.test(name)) return ""; return typeof (input.command ?? input.cmd) === "string" ? input.command ?? input.cmd : ""; }
export function writeTargets(event) { const input = toolInput(event), targets = [input.file_path, input.filePath, input.path, input.target_file, ...(event?.tool?.fileTargets ?? [])], patch = [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n"); for (const match of patch.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim()); return [...new Set(targets.filter((value) => typeof value === "string" && value))]; }
export function writeJson(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
export function preDeny(reason) { return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }; }
export function report(eventName, text) { return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } }; }
export function stopBlock(reason) { return { decision: "block", reason }; }
