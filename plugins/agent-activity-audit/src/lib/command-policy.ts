import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { extractToolResponse } from "./hook-io.js";

export type CommandStatus = "success" | "failure" | "unknown";

export type CommandStatusResult = {
  status: CommandStatus;
  exit_code: number | null;
};

export type RedactOptions = {
  maxCommandChars?: number | undefined;
  redactSecrets?: boolean | undefined;
};

/** Tip rewrite requires a non-empty tool_use_id on both sides. */
export function sameToolUseId(left: unknown, right: unknown): boolean {
  const a = left == null ? "" : String(left).trim();
  const b = right == null ? "" : String(right).trim();
  if (!a || !b) return false;
  return a === b;
}

export function redactCommand(command: unknown, options: RedactOptions = {}): string {
  const maxCommandChars = options.maxCommandChars ?? 2000;
  const redactSecrets = options.redactSecrets ?? true;
  let text = String(command ?? "");
  if (redactSecrets) {
    text = text
      .replace(/\b(Bearer)\s+[A-Za-z0-9._\-+/=]+/giu, "$1 ***")
      .replace(
        /\b((?:MYSQL_PWD|PGPASSWORD|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)[A-Za-z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
        "$1=***",
      )
      .replace(
        /\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY)[A-Za-z_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
        "$1=***",
      )
      .replace(
        /\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY)[A-Za-z_]*)\s*:\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
        "$1:***",
      )
      .replace(/(?:^|\s)(-u|--user)\s+\S+:\S+/giu, " $1 ***:****")
      .replace(/(?:^|\s)(--password|--passwd|-p)\s+(?:"[^"]*"|'[^']*'|\S+)/giu, " $1 ***");
  }
  if (text.length > maxCommandChars) {
    return `${text.slice(0, maxCommandChars)}…`;
  }
  return text;
}

export function inferCommandStatus(event: HookEvent, forceFailure = false): CommandStatusResult {
  if (forceFailure) {
    return { status: "failure", exit_code: extractExitCode(event) };
  }
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [
      ...response.matchAll(
        /(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu,
      ),
    ];
    const codeText = matches.at(-1)?.[1];
    if (codeText !== undefined) {
      const code = Number.parseInt(codeText, 10);
      return { status: code === 0 ? "success" : "failure", exit_code: code };
    }
    // String body with no parseable exit code → unknown (do not invent success).
    if (response.trim()) {
      return { status: "unknown", exit_code: null };
    }
  }
  if (isRecord(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number" && Number.isFinite(code)) {
      return { status: code === 0 ? "success" : "failure", exit_code: code };
    }
    // `status` as HTTP-like number only when clearly an exit field is absent.
    if (typeof response.status === "number" && Number.isFinite(response.status)) {
      // Only treat small integers as exit codes; avoid mistaking HTTP 200 etc.
      if (response.status >= 0 && response.status <= 255) {
        return {
          status: response.status === 0 ? "success" : "failure",
          exit_code: response.status,
        };
      }
    }
    if (response.success === false || response.is_error === true || response.isError === true) {
      return { status: "failure", exit_code: null };
    }
    if (response.success === true) {
      return { status: "success", exit_code: 0 };
    }
  }
  // No usable signal from the host.
  return { status: "unknown", exit_code: null };
}

function extractExitCode(event: HookEvent): number | null {
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [
      ...response.matchAll(
        /(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu,
      ),
    ];
    const codeText = matches.at(-1)?.[1];
    if (codeText !== undefined) return Number.parseInt(codeText, 10);
  }
  if (isRecord(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number" && Number.isFinite(code)) return code;
  }
  return null;
}

export function durationMs(startedAt: string, endedAt: string | Date = new Date()): number | null {
  const start = Date.parse(startedAt);
  const end = endedAt instanceof Date ? endedAt.getTime() : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}
