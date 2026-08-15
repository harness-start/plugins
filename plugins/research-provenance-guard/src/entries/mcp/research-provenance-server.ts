#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { isRecord } from "@harness/core/hook-event";

import { ResearchService } from "../../lib/server/research-service.js";

type JsonSchema = {
  type: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  minItems?: number;
  pattern?: string;
};

type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};

type ToolSpec = {
  name: string;
  description: string;
  properties: Record<string, string>;
  required: string[];
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

const TOOL_SPECS: ToolSpec[] = [
  { name: "research_begin", description: "Begin a hard-mode research run bound to the client workspace root. Optional run_id binds an existing project workflow opened by research-evidence-workflow.", properties: { question: "string", scope: "string", as_of: "string", prompt_epoch: "integer", run_id: "string" }, required: ["question", "scope", "as_of", "prompt_epoch"] },
  { name: "source_discover", description: "Discover candidate sources through Firecrawl. Discovery output is not evidence until captured.", properties: { query: "string", category: "string", limit: "integer" }, required: ["query"] },
  { name: "source_capture", description: "Capture a workspace file or public http(s) URL into immutable private plugin data.", properties: { kind: "string", path: "string", url: "string", via: "string" }, required: [] },
  { name: "source_read", description: "Read a bounded slice of captured untrusted source content.", properties: { source_id: "string", offset: "integer", limit: "integer" }, required: ["source_id"] },
  { name: "source_anchor", description: "Create an exact quote, line range, or RFC 6901 JSON pointer anchor.", properties: { source_id: "string", kind: "string", value: "string", start_line: "integer", end_line: "integer" }, required: ["source_id", "kind"] },
  { name: "research_status", description: "Inspect active run, source, anchor, epoch, and seal state.", properties: {}, required: [] },
  { name: "research_seal", description: "Validate claims and atomically generate the canonical research manifest and report.", properties: { run_id: "string", prompt_epoch: "integer", mutation_revision: "integer", claims: "array" }, required: ["run_id", "prompt_epoch", "mutation_revision", "claims"] },
];

const TOOLS: McpToolDefinition[] = TOOL_SPECS.map((spec) => ({
  name: spec.name,
  description: spec.description,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(spec.properties).map(([key, type]) => [key, type === "array" ? { type, items: { type: "object" } } : { type }])),
    required: spec.required,
  },
  annotations: {
    readOnlyHint: ["source_read", "research_status"].includes(spec.name),
    destructiveHint: false,
    idempotentHint: ["source_read", "research_status"].includes(spec.name),
    openWorldHint: ["source_discover", "source_capture"].includes(spec.name),
  },
}));

function requireTool(name: string): McpToolDefinition {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) throw new Error(`missing tool definition: ${name}`);
  return tool;
}

const sourceDiscover = requireTool("source_discover");
if (!sourceDiscover.inputSchema.properties) sourceDiscover.inputSchema.properties = {};
sourceDiscover.inputSchema.properties.category = { type: "string", enum: ["web", "news", "github", "research", "pdf", "developer"] };

requireTool("source_capture").inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["workspace", "web", "news", "github", "research", "pdf", "developer"] },
    path: { type: "string" },
    url: { type: "string" },
    via: { type: "string", enum: ["direct"] },
  },
};

const sourceAnchor = requireTool("source_anchor");
if (!sourceAnchor.inputSchema.properties) sourceAnchor.inputSchema.properties = {};
sourceAnchor.inputSchema.properties.kind = { type: "string", enum: ["exact_quote", "line_range", "json_pointer"] };

const researchSeal = requireTool("research_seal");
if (!researchSeal.inputSchema.properties) researchSeal.inputSchema.properties = {};
researchSeal.inputSchema.properties.claims = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^[A-Z][A-Za-z0-9_-]{0,63}$" },
      status: { type: "string", enum: ["anchored", "multi_anchored", "inferred", "contested", "unverified"] },
      text: { type: "string" },
      anchor_ids: { type: "array", items: { type: "string" } },
      supporting_anchor_ids: { type: "array", items: { type: "string" } },
      opposing_anchor_ids: { type: "array", items: { type: "string" } },
      basis: { type: "string" },
      caveat: { type: "string" },
      limitation: { type: "string" },
    },
    required: ["id", "status", "text"],
  },
};

function rpcErrorCode(error: unknown): number {
  if (isRecord(error) && typeof error.code === "number") return error.code;
  return -32602;
}

class StdioPeer {
  nextId = 1;
  pending = new Map<string, PendingRequest>();
  service: ResearchService | null = null;
  protocolVersion = "2025-06-18";
  reader = createInterface({ input: process.stdin, crlfDelay: Infinity });

  send(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = `server-${this.nextId++}`;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 10_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
    });
  }

  async ensureService(): Promise<ResearchService> {
    if (this.service) return this.service;
    const sessionId = process.env.AI_EXPERTS_SESSION_ID ?? process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? `mcp-${process.pid}`;
    const result = await this.request("roots/list");
    const roots = isRecord(result) ? result.roots : undefined;
    let workspaceRoot: string;
    const firstRoot = Array.isArray(roots) ? roots[0] : undefined;
    if (Array.isArray(roots) && roots.length === 1 && isRecord(firstRoot) && typeof firstRoot.uri === "string" && firstRoot.uri.startsWith("file:")) {
      workspaceRoot = resolve(decodeURIComponent(new URL(firstRoot.uri).pathname));
    } else if (
      Array.isArray(roots)
      && roots.length === 0
      && process.env.RESEARCH_PROVENANCE_HOST === "codex"
      && isAbsolute(process.env.PWD ?? "")
    ) {
      const pwd = process.env.PWD;
      if (!pwd) throw new Error("exactly one file workspace root is required");
      workspaceRoot = await realpath(pwd);
    } else {
      throw new Error("exactly one file workspace root is required");
    }
    this.service = new ResearchService({
      workspaceRoot,
      dataRoot: join(workspaceRoot, ".research", "state"),
      sessionId,
    });
    return this.service;
  }

  async handle(message: unknown): Promise<void> {
    if (!isRecord(message)) return;
    if (message && message.id !== undefined && !message.method && this.pending.has(String(message.id))) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(message.id));
      if (message.error) {
        const error = isRecord(message.error) ? message.error : {};
        pending.reject(new Error(typeof error.message === "string" ? error.message : "client request failed"));
      } else pending.resolve(message.result);
      return;
    }
    if (!message?.method || message.id === undefined) return;
    try {
      let result: unknown;
      if (message.method === "initialize") {
        const params = isRecord(message.params) ? message.params : undefined;
        if (typeof params?.protocolVersion === "string") this.protocolVersion = params.protocolVersion;
        result = {
          protocolVersion: this.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "research_provenance", version: "0.3.0" },
          instructions: "Call the registered namespaced research_provenance tools directly; select identifiers ending in __research_begin, __source_capture, and so on rather than emitting raw short-name calls. list_mcp_resources does not list tools. research_begin can create the project workflow when run_id is omitted. After sealing, only source_read and research_status remain available.",
        };
      } else if (message.method === "ping") result = {};
      else if (message.method === "tools/list") result = { tools: TOOLS };
      else if (message.method === "tools/call") {
        const service = await this.ensureService();
        const params = isRecord(message.params) ? message.params : {};
        const toolName = String(params.name);
        const args = params.arguments ?? {};
        const payload = await service.call(toolName, args);
        result = { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: false };
      } else throw Object.assign(new Error(`method not found: ${String(message.method)}`), { code: -32601 });
      this.send({ jsonrpc: "2.0", id: message.id, result });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (message.method === "tools/call") {
        this.send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: errorMessage }], isError: true } });
      } else this.send({ jsonrpc: "2.0", id: message.id, error: { code: rpcErrorCode(error), message: errorMessage } });
    }
  }

  run(): void {
    this.reader.on("line", (line: string) => {
      if (!line.trim()) return;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { this.send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); return; }
      this.handle(parsed).catch(() => {});
    });
  }
}

new StdioPeer().run();
