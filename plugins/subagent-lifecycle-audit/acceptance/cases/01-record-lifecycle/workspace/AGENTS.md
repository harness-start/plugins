# Lifecycle acceptance fixture

If this process is a spawned subagent that received a `NEW_TASK` message, reply
immediately with exactly `LIFECYCLE_OK`. Do not inspect the workspace, use tools,
modify files, or spawn another agent.

The root agent must follow the user prompt; the subagent-only rule above does
not authorize the root agent to skip dispatch.
