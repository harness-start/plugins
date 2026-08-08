#!/usr/bin/env node

import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { ResearchService } from "./lib/research-service.mjs";

const TOOLS = [
  ["research_begin", "Begin a hard-mode research run bound to the client workspace root. Optional run_id binds an existing project workflow opened by research-evidence-workflow.", { question: "string", scope: "string", as_of: "string", prompt_epoch: "integer", run_id: "string" }, ["question", "scope", "as_of", "prompt_epoch"]],
  ["source_discover", "Discover candidate sources through Firecrawl. Discovery output is not evidence until captured.", { query: "string", category: "string", limit: "integer" }, ["query"]],
  ["source_capture", "Capture a workspace file or public http(s) URL into immutable private plugin data.", { kind: "string", path: "string", url: "string", via: "string" }, []],
  ["source_read", "Read a bounded slice of captured untrusted source content.", { source_id: "string", offset: "integer", limit: "integer" }, ["source_id"]],
  ["source_anchor", "Create an exact quote, line range, or RFC 6901 JSON pointer anchor.", { source_id: "string", kind: "string", value: "string", start_line: "integer", end_line: "integer" }, ["source_id", "kind"]],
  ["research_status", "Inspect active run, source, anchor, epoch, and seal state.", {}, []],
  ["research_seal", "Validate claims and atomically generate the canonical research manifest and report.", { run_id: "string", prompt_epoch: "integer", mutation_revision: "integer", claims: "array" }, ["run_id", "prompt_epoch", "mutation_revision", "claims"]],
].map(([name, description, properties, required]) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(properties).map(([key, type]) => [key, type === "array" ? { type, items: { type: "object" } } : { type }])),
    required,
  },
  annotations: {
    readOnlyHint: ["source_read", "research_status"].includes(name),
    destructiveHint: false,
    idempotentHint: ["source_read", "research_status"].includes(name),
    openWorldHint: ["source_discover", "source_capture"].includes(name),
  },
}));

TOOLS.find(({ name }) => name === "source_discover").inputSchema.properties.category = { type: "string", enum: ["web", "news", "github", "research", "pdf", "developer"] };
TOOLS.find(({ name }) => name === "source_capture").inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["workspace", "web", "news", "github", "research", "pdf", "developer"] },
    path: { type: "string" },
    url: { type: "string" },
    via: { type: "string", enum: ["direct"] },
  }
};
TOOLS.find(({ name }) => name === "source_anchor").inputSchema.properties.kind = { type: "string", enum: ["exact_quote", "line_range", "json_pointer"] };
TOOLS.find(({ name }) => name === "research_seal").inputSchema.properties.claims = {
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

class StdioPeer {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.service = null;
    this.protocolVersion = "2025-06-18";
    this.reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  }

  send(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }

  request(method, params = {}) {
    const id = `server-${this.nextId++}`;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 10_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
    });
  }

  async ensureService() {
    if (this.service) return this.service;
    const dataRoot = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? process.env.RESEARCH_PLUGIN_DATA;
    const sessionId = process.env.AI_EXPERTS_SESSION_ID ?? process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? `mcp-${process.pid}`;
    if (!dataRoot) throw new Error("platform plugin data directory is unavailable");
    const result = await this.request("roots/list");
    const roots = result?.roots;
    if (!Array.isArray(roots) || roots.length !== 1 || typeof roots[0]?.uri !== "string" || !roots[0].uri.startsWith("file:")) throw new Error("exactly one file workspace root is required");
    const workspaceRoot = resolve(decodeURIComponent(new URL(roots[0].uri).pathname));
    this.service = new ResearchService({ workspaceRoot, dataRoot, sessionId });
    return this.service;
  }

  async handle(message) {
    if (message && message.id !== undefined && !message.method && this.pending.has(String(message.id))) {
      const pending = this.pending.get(String(message.id));
      clearTimeout(pending.timer);
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message ?? "client request failed"));
      else pending.resolve(message.result);
      return;
    }
    if (!message?.method || message.id === undefined) return;
    try {
      let result;
      if (message.method === "initialize") {
        this.protocolVersion = message.params?.protocolVersion ?? this.protocolVersion;
        result = { protocolVersion: this.protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "research_provenance", version: "0.2.0" } };
      } else if (message.method === "ping") result = {};
      else if (message.method === "tools/list") result = { tools: TOOLS };
      else if (message.method === "tools/call") {
        const service = await this.ensureService();
        const payload = await service.call(message.params?.name, message.params?.arguments ?? {});
        result = { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: false };
      } else throw Object.assign(new Error(`method not found: ${message.method}`), { code: -32601 });
      this.send({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (message.method === "tools/call") {
        this.send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: errorMessage }], isError: true } });
      } else this.send({ jsonrpc: "2.0", id: message.id, error: { code: error.code ?? -32602, message: errorMessage } });
    }
  }

  run() {
    this.reader.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try { message = JSON.parse(line); } catch { this.send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); return; }
      this.handle(message).catch(() => {});
    });
  }
}

new StdioPeer().run();
