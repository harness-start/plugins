def allowed_parent_call:
  if .payload.type == "function_call" and .payload.name == "spawn_agent" then true
  elif .payload.type == "function_call" and .payload.name == "wait_agent" then true
  elif .payload.type == "function_call" and .payload.name == "list_agents" then true
  elif .payload.type == "function_call" and .payload.name == "interrupt_agent" then true
  elif .payload.type == "function_call" and .payload.name == "update_plan" then true
  elif .payload.type == "function_call" and .payload.name == "exec_command" then
    ((.payload.arguments | fromjson? // {}) as $arguments
      | (($arguments.cmd | test("^cat /out/[A-Za-z0-9._/-]+/sdd-workflow/0\\.1\\.0/skills/sdd-build/SKILL\\.md(?:; echo '---'; ls -la /out/[A-Za-z0-9._/-]+/workspace)?$"))
        or ($arguments.cmd == "pwd && ls -la")
        or ($arguments.cmd | test("^(?:(?:cat(?: -A)?|wc -(?:c|l)|od -c) rejection\\.txt|echo \\\"---\\\")(?: && (?:(?:cat(?: -A)?|wc -(?:c|l)|od -c) rejection\\.txt|echo \\\"---\\\"))*$"))
        or ($arguments.cmd == "printf '%s\\n' 'parent rejected unverified workers' > rejection.txt && cat rejection.txt && printf 'bytes: ' && wc -c < rejection.txt")
        or ($arguments.cmd == "printf '%s' 'parent rejected unverified workers' > rejection.txt && wc -c rejection.txt")
        or ($arguments.cmd | test("^(?:printf 'parent rejected unverified workers\\\\n'|printf '%s(?:\\\\n)?' 'parent rejected unverified workers') > rejection\\.txt(?: && (?:(?:cat(?: -A)?|wc -(?:c|l)) rejection\\.txt|echo \\\"---\\\"))*$")))
      and (
        (($arguments.workdir // ".") == ".")
        or ($arguments.workdir == "/out/sdd-workflow__04-multi-task-context-isolation__codex/workspace")
      ))
  elif .payload.type == "custom_tool_call" and .payload.name == "apply_patch" then
    ((.payload.input // "") | test(
      "^\\*\\*\\* Begin Patch\\n\\*\\*\\* Add File: rejection\\.txt\\n\\+parent rejected unverified workers\\n\\*\\*\\* End Patch$"
    ))
  else false
  end;

[
  to_entries[]
  | .value
  | select(
      .type == "response_item"
      and (
        .payload.type == "function_call"
        or .payload.type == "custom_tool_call"
      )
    )
  | select(allowed_parent_call | not)
] | length == 0
