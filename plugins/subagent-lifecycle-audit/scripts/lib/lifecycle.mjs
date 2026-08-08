function openStarts(rows, agentId) {
  const stack = [];
  for (const row of rows) {
    if (row?.schema !== "subagent-lifecycle/v1" || row.agent_id !== agentId) {
      continue;
    }
    if (row.event === "started") stack.push(row);
    if (row.event === "stopped" && row.correlation === "matched") stack.pop();
  }
  return stack;
}

function durationMs(startClockNs, endClockNs) {
  try {
    const start = BigInt(startClockNs);
    const end = BigInt(endClockNs);
    if (end < start) return null;
    return Number(end - start) / 1_000_000;
  } catch {
    return null;
  }
}

function baseRecord(context, observedAt, clockNs) {
  return {
    schema: "subagent-lifecycle/v1",
    event: context.mode === "start" ? "started" : "stopped",
    observed_at: observedAt,
    host: context.host,
    session_id: context.sessionId,
    agent_id: context.agentId,
    agent_type: context.agentType,
    parent_agent_id: context.parentAgentId,
    started_at: null,
    ended_at: null,
    duration_ms: null,
    correlation: "missing-agent-id",
    monotonic_ns: clockNs,
    provenance: {
      session_id: context.provenanceSessionId,
      trigger_from: context.triggerFrom,
    },
  };
}

export function buildLifecycleRecord(context, rows, now = new Date()) {
  const observedAt = now.toISOString();
  const clockNs = process.hrtime.bigint().toString();
  const record = baseRecord(context, observedAt, clockNs);
  if (!context.agentId) return record;

  const starts = openStarts(rows, context.agentId);
  if (context.mode === "start") {
    return {
      ...record,
      started_at: observedAt,
      correlation: starts.length > 0 ? "duplicate-start" : "open",
    };
  }

  const start = starts.at(-1);
  if (!start) {
    return {
      ...record,
      ended_at: observedAt,
      correlation: "orphan-stop",
    };
  }
  return {
    ...record,
    agent_type: context.agentType ?? start.agent_type ?? null,
    parent_agent_id: context.parentAgentId ?? start.parent_agent_id ?? null,
    started_at: start.started_at,
    ended_at: observedAt,
    duration_ms: durationMs(start.monotonic_ns, clockNs),
    correlation: "matched",
  };
}
