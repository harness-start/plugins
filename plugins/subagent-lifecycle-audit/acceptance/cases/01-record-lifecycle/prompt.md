Spawn exactly one read-only subagent using `fork_turns: "none"`. Ask it to
reply with exactly `LIFECYCLE_OK`. Wait for that agent to finish, then relay
its exact reply. Do not modify files and do not spawn another subagent.
